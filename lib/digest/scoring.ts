import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { digestEntries } from '@/db/schema';
import { anthropic, MODELS, withClaudeLogging } from '@/lib/llm/client';
import {
  OPPORTUNITY_SCORING_PROMPT,
  OPPORTUNITY_SCORING_TOOL,
  buildContractorBlock,
  buildOpportunityBlock,
  type ScoringContractor,
} from '@/lib/llm/prompts/federal/opportunity-scoring';
import type { CandidateOpportunity } from '@/lib/digest/candidates';

// Step 4 of the digest pipeline. Per CLAUDE.md: "Cache LLM analysis of an
// opportunity for the life of that opportunity (re-score only on modification)."
// The cache key is (user_id, opportunity_id, opportunity_hash, bid_profile_version):
// if any of the inputs change, we re-score. Otherwise we lift the prior entry's
// score off the most recent digest_entry row.

// Zod gate at the LLM boundary — tool input is unknown until parsed.
const ScoreSchema = z.object({
  fit_score: z.number().int().min(0).max(100),
  bid_recommendation: z.enum(['bid', 'no_bid', 'watch']),
  reasoning_text: z.string().min(1),
  key_factors: z.array(z.string().min(1)).min(1).max(6),
});
export type RawScore = z.infer<typeof ScoreSchema>;

export interface OpportunityScore {
  opportunityId: string;
  fitScore: number;
  bidRecommendation: 'bid' | 'no_bid' | 'watch';
  reasoningText: string;
  keyFactors: string[];
  opportunityHash: string;
  bidProfileVersion: number;
  fromCache: boolean;
}

export interface ScoreBatchResult {
  scored: OpportunityScore[];
  llmCalls: number;
  cacheHits: number;
  failures: { opportunityId: string; error: string }[];
}

// Seams: scoring uses the Anthropic SDK in prod, the cache hits the DB.
// Both are injectable for tests.
export interface ScoringClient {
  score(opp: CandidateOpportunity, contractor: ScoringContractor): Promise<RawScore>;
}
export interface ScoringCache {
  // Look up a prior score matching the keys; null = miss.
  lookup(input: {
    userId: string;
    opportunityId: string;
    opportunityHash: string;
    bidProfileVersion: number;
  }): Promise<Pick<OpportunityScore, 'fitScore' | 'bidRecommendation' | 'reasoningText' | 'keyFactors'> | null>;
}

export class AnthropicScoringClient implements ScoringClient {
  async score(opp: CandidateOpportunity, contractor: ScoringContractor): Promise<RawScore> {
    const system = `${OPPORTUNITY_SCORING_PROMPT}\n\n${buildContractorBlock(contractor)}`;
    const userMsg = buildOpportunityBlock(opp.normalized);

    const res = await withClaudeLogging(
      { op: 'opportunity_scoring', opportunityId: opp.id },
      () =>
        anthropic().messages.create({
          model: MODELS.scoring,
          max_tokens: 512,
          // Identical system block across every opp this user is scored for
          // today. cache_control: ephemeral turns repeat calls into prompt-
          // cache hits (the prompt + contractor profile is by far the biggest
          // input chunk).
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools: [OPPORTUNITY_SCORING_TOOL],
          tool_choice: { type: 'tool', name: OPPORTUNITY_SCORING_TOOL.name },
          messages: [{ role: 'user', content: userMsg }],
        }),
    );

    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) {
      throw new Error(`opportunity_scoring: no tool_use returned (opp ${opp.id}).`);
    }
    return ScoreSchema.parse(toolUse.input);
  }
}

// Production cache: latest digest_entry per (user, opp) with matching hash +
// bid-profile version. Read-only; writes happen when we persist a new digest.
export class DrizzleScoringCache implements ScoringCache {
  async lookup(input: {
    userId: string;
    opportunityId: string;
    opportunityHash: string;
    bidProfileVersion: number;
  }): Promise<
    Pick<OpportunityScore, 'fitScore' | 'bidRecommendation' | 'reasoningText' | 'keyFactors'> | null
  > {
    const rows = await getDb()
      .select({
        fitScore: digestEntries.fitScore,
        bidRecommendation: digestEntries.bidRecommendation,
        reasoningText: digestEntries.reasoningText,
        keyFactors: digestEntries.keyFactors,
      })
      .from(digestEntries)
      .where(
        and(
          eq(digestEntries.userId, input.userId),
          eq(digestEntries.opportunityId, input.opportunityId),
          eq(digestEntries.opportunityHash, input.opportunityHash),
          eq(digestEntries.bidProfileVersion, input.bidProfileVersion),
        ),
      )
      .orderBy(desc(digestEntries.scoredAt))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    const rec = r.bidRecommendation;
    if (rec !== 'bid' && rec !== 'no_bid' && rec !== 'watch') return null;
    return {
      fitScore: r.fitScore,
      bidRecommendation: rec,
      reasoningText: r.reasoningText,
      keyFactors: Array.isArray(r.keyFactors) ? (r.keyFactors as string[]) : [],
    };
  }
}

export async function scoreCandidates(
  candidates: CandidateOpportunity[],
  context: {
    userId: string;
    contractor: ScoringContractor;
    bidProfileVersion: number;
  },
  client: ScoringClient,
  cache: ScoringCache,
): Promise<ScoreBatchResult> {
  let llmCalls = 0;
  let cacheHits = 0;
  const scored: OpportunityScore[] = [];
  const failures: { opportunityId: string; error: string }[] = [];

  // Sequential by design: Anthropic's SDK rate-limits and the prompt cache
  // hit pattern works best when calls share a cache prefix in order. For v1
  // throughput (≤25 opps/user/day per CLAUDE.md), sequential is plenty fast.
  for (const cand of candidates) {
    const cached = await cache.lookup({
      userId: context.userId,
      opportunityId: cand.id,
      opportunityHash: cand.rawDataHash,
      bidProfileVersion: context.bidProfileVersion,
    });
    if (cached) {
      cacheHits += 1;
      scored.push({
        opportunityId: cand.id,
        fitScore: cached.fitScore,
        bidRecommendation: cached.bidRecommendation,
        reasoningText: cached.reasoningText,
        keyFactors: cached.keyFactors,
        opportunityHash: cand.rawDataHash,
        bidProfileVersion: context.bidProfileVersion,
        fromCache: true,
      });
      continue;
    }

    try {
      const raw = await client.score(cand, context.contractor);
      llmCalls += 1;
      scored.push({
        opportunityId: cand.id,
        fitScore: raw.fit_score,
        bidRecommendation: raw.bid_recommendation,
        reasoningText: raw.reasoning_text,
        keyFactors: raw.key_factors,
        opportunityHash: cand.rawDataHash,
        bidProfileVersion: context.bidProfileVersion,
        fromCache: false,
      });
    } catch (err) {
      failures.push({
        opportunityId: cand.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { scored, llmCalls, cacheHits, failures };
}
