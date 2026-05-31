import { describe, expect, it, vi } from 'vitest';
import { generateDigest, type DigestEmailer, type DigestPersistence, type UserContactStore } from './generate';
import type { CandidateOpportunity, CandidateStore } from './candidates';
import type { DescriptionSource, DescriptionStore } from './descriptions';
import type { ScoringCache, ScoringClient } from './scoring';
import type { SynthesisClient } from './synthesis';
import type { ScoringContractor } from '@/lib/llm/prompts/federal/opportunity-scoring';

function cand(id: string, descText: string | null = `desc for ${id}`): CandidateOpportunity {
  return {
    id,
    rawDataHash: `h-${id}`,
    normalized: {
      jurisdiction: 'federal',
      externalNoticeId: id,
      solicitationNumber: null,
      title: `Opp ${id}`,
      department: 'DEPT OF DEFENSE',
      subTier: null,
      office: null,
      noticeType: 'Solicitation',
      naicsCode: '541512',
      pscCode: null,
      setAsideType: null,
      postedDate: '2026-05-01T00:00:00.000Z',
      responseDeadline: '2026-06-15T00:00:00.000Z',
      placeOfPerformance: null,
      descriptionUrl: 'https://sam.gov/opp/x',
      descriptionText: descText,
      pointOfContact: null,
      rawData: {},
    },
  };
}

const CONTRACTOR: ScoringContractor = {
  capabilitySummary: 'IT integrator',
  certifications: ['8(a)'],
  primaryNaics: ['541512'],
  secondaryNaics: [],
  setAsideTypes: ['Total Small Business'],
  placeOfPerformance: { states: [], remote: false, nationwide: true },
  hqState: null,
  valueMin: null,
  valueMax: null,
  role: 'prime',
  walkAwaySignals: [],
  differentiators: [],
  incumbentDisplacementAppetite: null,
  teamingPosture: null,
  responseEffortTolerance: null,
};

class FakeCandidateStore implements CandidateStore {
  constructor(private readonly opps: CandidateOpportunity[]) {}
  async loadUserProfile() {
    return {
      userId: 'u1',
      jurisdiction: 'federal',
      bidProfileVersion: 1,
      eligibility: {
        primaryNaics: ['541512'],
        secondaryNaics: [],
        setAsideTypes: ['Total Small Business'],
        noticeTypes: ['Solicitation'],
        agenciesExcluded: [],
        placeOfPerformance: { states: [], remote: false, nationwide: true },
      },
    };
  }
  async loadCandidateOpportunities() {
    return this.opps;
  }
}

class FakeContactStore implements UserContactStore {
  async loadContractor() {
    return { email: 'founder@example.com', contractor: CONTRACTOR };
  }
}

class FakeDescriptionSource implements DescriptionSource {
  async fetchDescription() {
    return 'fetched description';
  }
}

class NoopDescriptionStore implements DescriptionStore {
  async saveDescription() {}
}

class FakeScoringClient implements ScoringClient {
  constructor(private readonly behavior: (id: string) => Promise<{ fit_score: number; bid_recommendation: 'bid' | 'no_bid' | 'watch'; reasoning_text: string; key_factors: string[] }>) {}
  async score(opp: CandidateOpportunity) {
    return this.behavior(opp.id);
  }
}

class NeverCache implements ScoringCache {
  async lookup() {
    return null;
  }
}

class FakeSynthesisClient implements SynthesisClient {
  public lastEntries: unknown = null;
  async writeHeader(entries: unknown[]) {
    this.lastEntries = entries;
    return `Today: ${entries.length} entries`;
  }
}

class FakeDigestStore implements DigestPersistence {
  public started: unknown[] = [];
  public saved: unknown[] = [];
  public finished: unknown[] = [];
  async startDigest(input: unknown) {
    this.started.push(input);
    return 'digest-1';
  }
  async saveEntries(digestId: string, userId: string, rows: unknown[]) {
    this.saved.push({ digestId, userId, rows });
  }
  async finishDigest(digestId: string, fields: unknown) {
    this.finished.push({ digestId, fields });
  }
}

class CapturingEmailer implements DigestEmailer {
  public calls: { to: string; subject: string }[] = [];
  async send(to: string, r: { subject: string }) {
    this.calls.push({ to, subject: r.subject });
    return { id: 'resend-id-xyz' };
  }
}

const NOW = new Date('2026-05-29T00:00:00.000Z');

describe('generateDigest', () => {
  it('runs end-to-end with all seams faked and persists the digest', async () => {
    const candidates = [cand('a', null), cand('b', null)]; // both need description fetch
    const scoringClient = new FakeScoringClient(async (id) => ({
      fit_score: id === 'a' ? 85 : 70,
      bid_recommendation: 'bid',
      reasoning_text: `r ${id}`,
      key_factors: ['k1'],
    }));
    const synth = new FakeSynthesisClient();
    const store = new FakeDigestStore();
    const emailer = new CapturingEmailer();

    const result = await generateDigest({
      userId: 'u1',
      now: NOW,
      candidateStore: new FakeCandidateStore(candidates),
      descriptionSource: new FakeDescriptionSource(),
      descriptionStore: new NoopDescriptionStore(),
      scoringClient,
      scoringCache: new NeverCache(),
      synthesisClient: synth,
      digestStore: store,
      userContactStore: new FakeContactStore(),
      emailer,
    });

    expect(result.candidatesConsidered).toBe(2);
    expect(result.eligible).toBe(2);
    expect(result.descriptionsFetched).toBe(2);
    expect(result.llmCalls).toBe(2);
    expect(result.cacheHits).toBe(0);
    expect(result.entriesCount).toBe(2);
    expect(result.emailSent).toBe(true);
    expect(result.resendId).toBe('resend-id-xyz');
    expect(emailer.calls[0].to).toBe('founder@example.com');
    expect(emailer.calls[0].subject).toContain('2026-05-29');

    expect(store.started).toHaveLength(1);
    expect(store.saved).toHaveLength(1);
    const savedRow = store.saved[0] as { rows: { rank: number; opportunityId: string }[] };
    expect(savedRow.rows.map((r) => r.opportunityId)).toEqual(['a', 'b']);

    const finished = store.finished[0] as { fields: { status: string; entriesCount: number } };
    expect(finished.fields.status).toBe('sent');
    expect(finished.fields.entriesCount).toBe(2);
  });

  it('marks the digest sent (not failed) when sendTo=null (render-and-persist only)', async () => {
    const store = new FakeDigestStore();
    const emailer = new CapturingEmailer();
    const result = await generateDigest({
      userId: 'u1',
      now: NOW,
      sendTo: null,
      candidateStore: new FakeCandidateStore([cand('a')]),
      descriptionSource: new FakeDescriptionSource(),
      descriptionStore: new NoopDescriptionStore(),
      scoringClient: new FakeScoringClient(async () => ({
        fit_score: 80,
        bid_recommendation: 'bid',
        reasoning_text: 'r',
        key_factors: ['k'],
      })),
      scoringCache: new NeverCache(),
      synthesisClient: new FakeSynthesisClient(),
      digestStore: store,
      userContactStore: new FakeContactStore(),
      emailer,
    });
    expect(result.emailSent).toBe(false);
    expect(emailer.calls).toHaveLength(0);
    const finished = store.finished[0] as { fields: { status: string } };
    expect(finished.fields.status).toBe('sent');
  });

  it('marks the digest failed when the email send throws (status reflects the failure)', async () => {
    const store = new FakeDigestStore();
    const emailer: DigestEmailer = {
      send: vi.fn(async () => {
        throw new Error('resend 500');
      }),
    };
    const result = await generateDigest({
      userId: 'u1',
      now: NOW,
      candidateStore: new FakeCandidateStore([cand('a')]),
      descriptionSource: new FakeDescriptionSource(),
      descriptionStore: new NoopDescriptionStore(),
      scoringClient: new FakeScoringClient(async () => ({
        fit_score: 80,
        bid_recommendation: 'bid',
        reasoning_text: 'r',
        key_factors: ['k'],
      })),
      scoringCache: new NeverCache(),
      synthesisClient: new FakeSynthesisClient(),
      digestStore: store,
      userContactStore: new FakeContactStore(),
      emailer,
    });
    expect(result.emailSent).toBe(false);
    expect(result.failures.map((f) => f.stage)).toEqual(['email_send']);
    const finished = store.finished[0] as { fields: { status: string; error?: string } };
    expect(finished.fields.status).toBe('failed');
    expect(finished.fields.error).toContain('email_send');
  });

  it('persists per-stage failures as a delimited error string for ops visibility', async () => {
    const store = new FakeDigestStore();
    const result = await generateDigest({
      userId: 'u1',
      now: NOW,
      candidateStore: new FakeCandidateStore([cand('a', null), cand('b', null)]),
      descriptionSource: {
        // First call fails (counts as failure), second succeeds.
        fetchDescription: vi
          .fn()
          .mockRejectedValueOnce(new Error('detail 404'))
          .mockResolvedValueOnce('ok'),
      },
      descriptionStore: new NoopDescriptionStore(),
      scoringClient: new FakeScoringClient(async () => ({
        fit_score: 50,
        bid_recommendation: 'bid',
        reasoning_text: 'r',
        key_factors: ['k'],
      })),
      scoringCache: new NeverCache(),
      synthesisClient: new FakeSynthesisClient(),
      digestStore: store,
      userContactStore: new FakeContactStore(),
      emailer: new CapturingEmailer(),
    });
    expect(result.failures.map((f) => f.stage)).toEqual(['description_fetch']);
    const finished = store.finished[0] as { fields: { error?: string } };
    expect(finished.fields.error).toContain('description_fetch');
    expect(finished.fields.error).toContain('detail 404');
  });

  it('throws when the user has no contact / profile', async () => {
    const empty: UserContactStore = { loadContractor: async () => null };
    await expect(
      generateDigest({
        userId: 'u-missing',
        now: NOW,
        candidateStore: new FakeCandidateStore([]),
        descriptionSource: new FakeDescriptionSource(),
        descriptionStore: new NoopDescriptionStore(),
        scoringClient: new FakeScoringClient(async () => ({
          fit_score: 0,
          bid_recommendation: 'no_bid',
          reasoning_text: 'r',
          key_factors: ['k'],
        })),
        scoringCache: new NeverCache(),
        synthesisClient: new FakeSynthesisClient(),
        digestStore: new FakeDigestStore(),
        userContactStore: empty,
        emailer: new CapturingEmailer(),
      }),
    ).rejects.toThrow(/No contact/);
  });
});
