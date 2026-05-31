import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  bidProfiles,
  companyPreferences,
  digestEntries,
  digests,
  users,
} from '@/db/schema';
import { getActiveSource } from '@/lib/opportunities/sources';
import type { ScoringContractor } from '@/lib/llm/prompts/federal/opportunity-scoring';
import {
  DrizzleCandidateStore,
  selectCandidates,
  type CandidateStore,
} from './candidates';
import {
  DrizzleDescriptionStore,
  fetchMissingDescriptions,
  type DescriptionSource,
  type DescriptionStore,
} from './descriptions';
import {
  AnthropicScoringClient,
  DrizzleScoringCache,
  scoreCandidates,
  type ScoringCache,
  type ScoringClient,
} from './scoring';
import {
  AnthropicSynthesisClient,
  synthesizeDigest,
  type SynthesisClient,
} from './synthesis';
import { renderDigest, type RenderedDigest } from './render';
import { sendEmail } from '@/lib/email/resend-client';

// The end-to-end run for ONE user, ONE day. Wires together candidates →
// description fetch → scoring → synthesis → render → send → persist.
// Every external seam is injectable so this is exercisable without DB +
// Anthropic + Resend.

export interface DigestPersistence {
  // Returns the digest_id (new or existing) we should write entries against.
  // Idempotent: re-running for the same (user, date) reuses the row.
  startDigest(input: {
    userId: string;
    jurisdiction: string;
    digestDate: string;
  }): Promise<string>;
  saveEntries(
    digestId: string,
    userId: string,
    rows: Array<{
      opportunityId: string;
      rank: number;
      fitScore: number;
      bidRecommendation: 'bid' | 'no_bid' | 'watch';
      reasoningText: string;
      keyFactors: string[];
      responseDeadline: Date | null;
      opportunityHash: string;
      bidProfileVersion: number;
    }>,
  ): Promise<void>;
  finishDigest(
    digestId: string,
    fields: {
      status: 'sent' | 'failed';
      candidatesConsidered: number;
      entriesCount: number;
      error?: string;
      sentAt?: Date;
    },
  ): Promise<void>;
}

export interface DigestEmailer {
  send(to: string, rendered: RenderedDigest): Promise<{ id: string }>;
}

export interface UserContactStore {
  // Returns the user's email + contractor profile slice (joined from
  // company_preferences + bid_profile + company_enrichment, when present).
  loadContractor(userId: string): Promise<{ email: string; contractor: ScoringContractor } | null>;
}

export interface GenerateOptions {
  userId: string;
  now?: Date;
  candidateStore?: CandidateStore;
  descriptionSource?: DescriptionSource;
  descriptionStore?: DescriptionStore;
  scoringClient?: ScoringClient;
  scoringCache?: ScoringCache;
  synthesisClient?: SynthesisClient;
  digestStore?: DigestPersistence;
  userContactStore?: UserContactStore;
  emailer?: DigestEmailer;
  // null = render-and-persist only (no email). Defaults to the user's email.
  sendTo?: string | null;
  // Per-run cap on description fetches; defaults to fetchMissingDescriptions's default.
  maxDescriptionFetches?: number;
  // Per-digest cap on final entries.
  maxEntries?: number;
}

export interface DigestRunResult {
  digestId: string;
  userId: string;
  digestDate: string;
  candidatesConsidered: number;
  eligible: number;
  descriptionsFetched: number;
  descriptionsDeferred: number;
  llmCalls: number;
  cacheHits: number;
  entriesCount: number;
  emailSent: boolean;
  resendId: string | null;
  failures: Array<{ stage: string; opportunityId?: string; error: string }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function generateDigest(opts: GenerateOptions): Promise<DigestRunResult> {
  const now = opts.now ?? new Date();
  const candidateStore = opts.candidateStore ?? new DrizzleCandidateStore();
  const descriptionStore = opts.descriptionStore ?? new DrizzleDescriptionStore();
  const descriptionSource = opts.descriptionSource ?? getActiveSource();
  const scoringCache = opts.scoringCache ?? new DrizzleScoringCache();
  const scoringClient = opts.scoringClient ?? new AnthropicScoringClient();
  const synthesisClient = opts.synthesisClient ?? new AnthropicSynthesisClient();
  const digestStore = opts.digestStore ?? new DrizzleDigestStore();
  const userContactStore = opts.userContactStore ?? new DrizzleUserContactStore();
  const emailer = opts.emailer ?? {
    send: (to, r) => sendEmail({ to, subject: r.subject, html: r.html, text: r.text }),
  };

  const contact = await userContactStore.loadContractor(opts.userId);
  if (!contact) throw new Error(`No contact / profile for user ${opts.userId}.`);

  const candidates = await selectCandidates(candidateStore, opts.userId, now);
  const digestDate = isoDate(now);

  const digestId = await digestStore.startDigest({
    userId: opts.userId,
    jurisdiction: candidates.jurisdiction,
    digestDate,
  });

  const failures: DigestRunResult['failures'] = [];

  try {
    const fetched = await fetchMissingDescriptions(
      candidates.eligible,
      descriptionSource,
      descriptionStore,
      { maxFetches: opts.maxDescriptionFetches },
    );
    for (const f of fetched.failures) {
      failures.push({ stage: 'description_fetch', opportunityId: f.opportunityId, error: f.error });
    }

    const scored = await scoreCandidates(
      fetched.hydrated,
      {
        userId: opts.userId,
        contractor: contact.contractor,
        bidProfileVersion: candidates.bidProfileVersion,
      },
      scoringClient,
      scoringCache,
    );
    for (const f of scored.failures) {
      failures.push({ stage: 'scoring', opportunityId: f.opportunityId, error: f.error });
    }

    const synthesis = await synthesizeDigest(
      fetched.hydrated,
      scored.scored,
      synthesisClient,
      opts.maxEntries,
      now,
    );

    await digestStore.saveEntries(
      digestId,
      opts.userId,
      synthesis.entries.map((e) => ({
        opportunityId: e.candidate.id,
        rank: e.rank,
        fitScore: e.score.fitScore,
        bidRecommendation: e.score.bidRecommendation,
        reasoningText: e.score.reasoningText,
        keyFactors: e.score.keyFactors,
        responseDeadline: e.candidate.normalized.responseDeadline
          ? new Date(e.candidate.normalized.responseDeadline)
          : null,
        opportunityHash: e.score.opportunityHash,
        bidProfileVersion: e.score.bidProfileVersion,
      })),
    );

    const rendered = renderDigest(synthesis, now);
    const recipient = opts.sendTo === undefined ? contact.email : opts.sendTo;
    let emailSent = false;
    let resendId: string | null = null;
    if (recipient !== null) {
      try {
        const sent = await emailer.send(recipient, rendered);
        emailSent = true;
        resendId = sent.id;
      } catch (err) {
        failures.push({
          stage: 'email_send',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await digestStore.finishDigest(digestId, {
      status: emailSent || recipient === null ? 'sent' : 'failed',
      candidatesConsidered: candidates.candidatesConsidered,
      entriesCount: synthesis.entries.length,
      sentAt: emailSent ? now : undefined,
      error: failures.length > 0 ? failures.map((f) => `[${f.stage}] ${f.error}`).join('; ') : undefined,
    });

    return {
      digestId,
      userId: opts.userId,
      digestDate,
      candidatesConsidered: candidates.candidatesConsidered,
      eligible: candidates.eligible.length,
      descriptionsFetched: fetched.fetched,
      descriptionsDeferred: fetched.deferred,
      llmCalls: scored.llmCalls,
      cacheHits: scored.cacheHits,
      entriesCount: synthesis.entries.length,
      emailSent,
      resendId,
      failures,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await digestStore.finishDigest(digestId, {
      status: 'failed',
      candidatesConsidered: candidates.candidatesConsidered,
      entriesCount: 0,
      error: msg,
    });
    throw err;
  }
}

// --- Production stores ---

export class DrizzleDigestStore implements DigestPersistence {
  async startDigest(input: {
    userId: string;
    jurisdiction: string;
    digestDate: string;
  }): Promise<string> {
    const db = getDb();
    // Idempotent: ON CONFLICT updates status to 'generating' and returns id.
    const inserted = await db
      .insert(digests)
      .values({
        userId: input.userId,
        jurisdiction: input.jurisdiction,
        digestDate: input.digestDate,
        status: 'generating',
      })
      .onConflictDoUpdate({
        target: [digests.userId, digests.digestDate, digests.jurisdiction],
        set: { status: 'generating' },
      })
      .returning({ id: digests.id });
    return inserted[0].id;
  }

  async saveEntries(
    digestId: string,
    userId: string,
    rows: Array<{
      opportunityId: string;
      rank: number;
      fitScore: number;
      bidRecommendation: 'bid' | 'no_bid' | 'watch';
      reasoningText: string;
      keyFactors: string[];
      responseDeadline: Date | null;
      opportunityHash: string;
      bidProfileVersion: number;
    }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    const db = getDb();
    // Replace prior entries for this digest_id so re-runs are clean.
    await db.delete(digestEntries).where(eq(digestEntries.digestId, digestId));
    await db.insert(digestEntries).values(
      rows.map((r) => ({
        digestId,
        userId,
        opportunityId: r.opportunityId,
        rank: r.rank,
        fitScore: r.fitScore,
        bidRecommendation: r.bidRecommendation,
        reasoningText: r.reasoningText,
        keyFactors: r.keyFactors,
        responseDeadline: r.responseDeadline,
        opportunityHash: r.opportunityHash,
        bidProfileVersion: r.bidProfileVersion,
      })),
    );
  }

  async finishDigest(
    digestId: string,
    fields: {
      status: 'sent' | 'failed';
      candidatesConsidered: number;
      entriesCount: number;
      error?: string;
      sentAt?: Date;
    },
  ): Promise<void> {
    await getDb()
      .update(digests)
      .set({
        status: fields.status,
        candidatesConsidered: fields.candidatesConsidered,
        entriesCount: fields.entriesCount,
        error: fields.error ?? null,
        sentAt: fields.sentAt ?? null,
      })
      .where(eq(digests.id, digestId));
  }
}

export class DrizzleUserContactStore implements UserContactStore {
  async loadContractor(
    userId: string,
  ): Promise<{ email: string; contractor: ScoringContractor } | null> {
    const db = getDb();
    const userRows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (userRows.length === 0) return null;

    const prefsRows = await db
      .select()
      .from(companyPreferences)
      .where(eq(companyPreferences.userId, userId))
      .limit(1);
    if (prefsRows.length === 0) return null;
    const prefs = prefsRows[0];

    const bidRows = await db
      .select()
      .from(bidProfiles)
      .where(eq(bidProfiles.userId, userId))
      .limit(1);
    const bid = bidRows[0];

    const pop = (prefs.placeOfPerformance as {
      states?: unknown;
      remote?: unknown;
      nationwide?: unknown;
    }) ?? {};

    const contractor: ScoringContractor = {
      capabilitySummary: bid?.capabilitySummary ?? null,
      certifications: prefs.certifications,
      primaryNaics: prefs.primaryNaics,
      secondaryNaics: prefs.secondaryNaics,
      setAsideTypes: prefs.setAsideTypes,
      placeOfPerformance: {
        states: Array.isArray(pop.states) ? (pop.states as string[]) : [],
        remote: Boolean(pop.remote),
        nationwide: Boolean(pop.nationwide),
      },
      hqState: prefs.hqState ?? null,
      valueMin: prefs.valueMin,
      valueMax: prefs.valueMax,
      role: prefs.role,
      walkAwaySignals: Array.isArray(bid?.walkAwaySignals)
        ? (bid?.walkAwaySignals as string[])
        : [],
      differentiators: Array.isArray(bid?.differentiators)
        ? (bid?.differentiators as string[])
        : [],
      incumbentDisplacementAppetite: bid?.incumbentDisplacementAppetite ?? null,
      teamingPosture: bid?.teamingPosture ?? null,
      responseEffortTolerance: bid?.responseEffortTolerance ?? null,
    };

    return { email: userRows[0].email, contractor };
  }
}

// Helper for the cron route — finds users eligible for a digest at this hour.
// "Eligible" = has company_preferences AND no digest yet for today.
export async function findUsersDueForDigest(now: Date = new Date()): Promise<string[]> {
  const db = getDb();
  const hour = now.getUTCHours();
  // We store digest_delivery_hour as the user's LOCAL hour; matching by UTC
  // hour without applying the user's timezone is an approximation v1
  // accepts (the founder is the only user). Real timezone math lands when
  // there's a second user with a different TZ.
  const today = isoDate(now);

  const candidates = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.digestDeliveryHour, hour));

  // Filter out users who already have a digest for today (cron runs hourly
  // through Vercel; we don't want to re-send if the previous hour's run
  // already covered this user).
  const dueIds: string[] = [];
  for (const u of candidates) {
    const existing = await db
      .select({ id: digests.id, status: digests.status })
      .from(digests)
      .where(and(eq(digests.userId, u.id), eq(digests.digestDate, today)))
      .limit(1);
    if (existing.length === 0 || existing[0].status === 'failed') {
      dueIds.push(u.id);
    }
  }
  return dueIds;
}
