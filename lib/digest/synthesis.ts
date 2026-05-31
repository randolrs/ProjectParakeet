import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { anthropic, MODELS, withClaudeLogging } from '@/lib/llm/client';
import {
  DIGEST_HEADER_PROMPT,
  DIGEST_HEADER_TOOL,
  buildEntriesBlock,
  type SynthesisEntry,
} from '@/lib/llm/prompts/federal/digest-synthesis';
import type { CandidateOpportunity } from '@/lib/digest/candidates';
import type { OpportunityScore } from '@/lib/digest/scoring';

// Step 5. Deterministic ranking (cheap, no LLM) + a single Sonnet call to
// write the email opener. Per-opp reasoning came from Haiku in step 4 —
// Sonnet's only job here is the TL;DR. That keeps the synthesis cost a
// constant per digest, not per-opp.

const DEFAULT_MAX_ENTRIES = 15;

export interface RankedEntry {
  rank: number;
  candidate: CandidateOpportunity;
  score: OpportunityScore;
}

export interface DigestSynthesis {
  header: string;
  entries: RankedEntry[];
}

// Bid is the highest signal; watch is informational; no_bid is filler we
// don't include unless we have nothing else. This drives the rank tiebreak
// when fit scores are close.
const RECOMMENDATION_WEIGHT: Record<OpportunityScore['bidRecommendation'], number> = {
  bid: 2,
  watch: 1,
  no_bid: 0,
};

export function rankEntries(
  candidates: CandidateOpportunity[],
  scores: OpportunityScore[],
  maxEntries: number = DEFAULT_MAX_ENTRIES,
  now: Date = new Date(),
): RankedEntry[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  // Score order: recommendation tier first (a bid beats a watch beats a
  // no_bid even at higher fit), then fit_score desc, then deadline asc
  // (sooner first; nulls last). no_bid entries are dropped — the digest is
  // an action list, not a junk drawer.
  const scoredWithCand = scores
    .map((s) => ({ s, c: byId.get(s.opportunityId) }))
    .filter((x): x is { s: OpportunityScore; c: CandidateOpportunity } => x.c !== undefined)
    .filter((x) => x.s.bidRecommendation !== 'no_bid');

  scoredWithCand.sort((a, b) => {
    const recDiff = RECOMMENDATION_WEIGHT[b.s.bidRecommendation] - RECOMMENDATION_WEIGHT[a.s.bidRecommendation];
    if (recDiff !== 0) return recDiff;
    if (b.s.fitScore !== a.s.fitScore) return b.s.fitScore - a.s.fitScore;
    const ad = a.c.normalized.responseDeadline
      ? new Date(a.c.normalized.responseDeadline).getTime()
      : Number.POSITIVE_INFINITY;
    const bd = b.c.normalized.responseDeadline
      ? new Date(b.c.normalized.responseDeadline).getTime()
      : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.c.id.localeCompare(b.c.id);
  });

  // After ordering, bump anything closing within 72h to the top of its tier
  // — the founder said "I'm about to miss this" is the highest-utility
  // alert the digest can deliver.
  const urgentMs = 72 * 36e5;
  const urgent = scoredWithCand.filter(
    (x) =>
      x.c.normalized.responseDeadline &&
      new Date(x.c.normalized.responseDeadline).getTime() - now.getTime() < urgentMs &&
      new Date(x.c.normalized.responseDeadline).getTime() >= now.getTime(),
  );
  const nonUrgent = scoredWithCand.filter((x) => !urgent.includes(x));
  const ordered = [...urgent, ...nonUrgent].slice(0, maxEntries);

  return ordered.map((x, i) => ({ rank: i + 1, candidate: x.c, score: x.s }));
}

export interface SynthesisClient {
  writeHeader(entries: SynthesisEntry[]): Promise<string>;
}

export class AnthropicSynthesisClient implements SynthesisClient {
  async writeHeader(entries: SynthesisEntry[]): Promise<string> {
    if (entries.length === 0) {
      return 'No new opportunities matched your profile today.';
    }
    const userMsg = buildEntriesBlock(entries);

    const res = await withClaudeLogging({ op: 'digest_header', entryCount: entries.length }, () =>
      anthropic().messages.create({
        model: MODELS.onboarding, // Sonnet 4.6 — per SPEC, used for digest reasoning
        max_tokens: 512,
        system: [{ type: 'text', text: DIGEST_HEADER_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: [DIGEST_HEADER_TOOL],
        tool_choice: { type: 'tool', name: DIGEST_HEADER_TOOL.name },
        messages: [{ role: 'user', content: userMsg }],
      }),
    );

    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) throw new Error('digest_header: no tool_use returned.');
    const parsed = z
      .object({ header: z.string().min(1).max(600) })
      .parse(toolUse.input);
    return parsed.header;
  }
}

export async function synthesizeDigest(
  candidates: CandidateOpportunity[],
  scores: OpportunityScore[],
  client: SynthesisClient,
  maxEntries: number = DEFAULT_MAX_ENTRIES,
  now: Date = new Date(),
): Promise<DigestSynthesis> {
  const entries = rankEntries(candidates, scores, maxEntries, now);
  const headerInput: SynthesisEntry[] = entries.map((e) => ({
    rank: e.rank,
    title: e.candidate.normalized.title,
    noticeType: e.candidate.normalized.noticeType,
    fitScore: e.score.fitScore,
    bidRecommendation: e.score.bidRecommendation,
    agency: e.candidate.normalized.department,
    setAside: e.candidate.normalized.setAsideType,
    responseDeadline: e.candidate.normalized.responseDeadline,
  }));
  const header = await client.writeHeader(headerInput);
  return { header, entries };
}
