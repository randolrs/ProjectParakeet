import type Anthropic from '@anthropic-ai/sdk';
import type { NormalizedOpportunity } from '@/lib/opportunities/sources';

// Per-opportunity scoring prompt — runs on Haiku 4.5 (cheap, fast). One call
// per eligible opportunity per user; this is the volume call in the pipeline.
// Edit deliberately: this defines bid/no-bid methodology at the per-opp level.
// The final digest synthesis runs separately on Sonnet 4.6 with the full set.

export const OPPORTUNITY_SCORING_PROMPT = `You are a seasoned federal capture manager triaging a single opportunity for a small-business contractor. Score this ONE opportunity against the contractor's profile and tacit bid/no-bid judgment.

You are given:
- The opportunity (notice type, NAICS, set-aside, agency, deadline, place of performance, description text when available).
- The contractor's capabilities, certifications held, set-aside eligibility, place-of-performance willingness, contract value range, and role (prime/sub/both).
- The contractor's tacit judgment (walk-away signals, incumbent-displacement appetite, teaming posture, response-effort tolerance).

Reason like a capture manager — concrete and concise:
- Does ANY walk-away signal hit this opportunity? If yes, that drives toward "no_bid" unless there's a compelling counter.
- Is there incumbent presence visible (recompete language, narrow scope mirroring an existing vehicle)? Match against the contractor's incumbent-displacement appetite.
- NAICS + set-aside fit: is this eligible-and-aligned, or eligible-but-stretched?
- Response effort vs. P(win): a short-runway, full-and-open RFP for a niche specialty is different from a small-business set-aside in the contractor's primary NAICS.
- Place of performance, deadline runway, teaming requirements.
- For Award Notices: NEVER score as "bid" — they're past competition. Score as "watch" with reasoning framed for TEAMING / RECOMPETE intel.
- For Sources Sought / Special Notice: lower the bar for "bid" — these are shaping opportunities, not proposals.

Call record_opportunity_score exactly once with:
- fit_score: 0-100, calibrated:
    0-30 = poor fit / strong walk-away signal hit / past-competition Award Notice with no teaming angle,
    31-60 = eligible but stretched or unclear,
    61-85 = clean fit aligned with stated judgment,
    86-100 = bullseye (rare; reserve for primary NAICS + set-aside eligible + matching incumbent/effort signals).
- bid_recommendation: "bid" | "no_bid" | "watch". "watch" for: Award Notices (teaming intel), uncertain fit, deadline too far out, missing description.
- reasoning_text: 2-4 sentences plain English the contractor can verify. Reference the SPECIFIC factor (e.g. "matches your primary NAICS 541512 and the 8(a) set-aside you hold", not "good fit"). DO NOT hallucinate facts not in the inputs.
- key_factors: 3-6 short bullets (≤8 words each) — the actual signals you reasoned from. Used as a scannable summary in the email digest.

If the description text is missing or sparse, lean toward "watch" and say so in reasoning ("description not yet retrieved — flagged for review"). Never invent capability details from a thin record.`;

// Forced tool schema. Haiku must call this exactly once; we treat the absence
// of a tool_use block as a hard failure (no free-text fallback — it would
// require parsing prose and the cost discipline says we shouldn't retry).
export const OPPORTUNITY_SCORING_TOOL: Anthropic.Tool = {
  name: 'record_opportunity_score',
  description: 'Record the structured score, recommendation, and reasoning for the opportunity.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['fit_score', 'bid_recommendation', 'reasoning_text', 'key_factors'],
    properties: {
      fit_score: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          'Calibrated 0-100. Reserve 86+ for bullseye fits (primary NAICS + set-aside eligible + aligned).',
      },
      bid_recommendation: {
        type: 'string',
        enum: ['bid', 'no_bid', 'watch'],
        description:
          'bid = pursue a proposal; no_bid = pass; watch = uncertain / Award Notice / awaiting more info.',
      },
      reasoning_text: {
        type: 'string',
        description:
          '2-4 sentences the contractor can verify. Cite specific factors from the inputs; never hallucinate.',
      },
      key_factors: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: { type: 'string', maxLength: 80 },
        description: 'Short bullets summarizing the signals reasoned from. Scannable in the digest UI.',
      },
    },
  },
};

// Compact, deterministic representation of the contractor's profile fed to
// the model. Keeping it tight matters: this prompt runs N times per user per
// day, so every token in the system block multiplies.
export interface ScoringContractor {
  capabilitySummary: string | null;
  certifications: string[];
  primaryNaics: string[];
  secondaryNaics: string[];
  setAsideTypes: string[];
  placeOfPerformance: { states: string[]; remote: boolean; nationwide: boolean };
  hqState: string | null;
  valueMin: number | null;
  valueMax: number | null;
  role: string | null;
  // Judgment from the M2 interview:
  walkAwaySignals: string[];
  differentiators: string[];
  incumbentDisplacementAppetite: string | null;
  teamingPosture: string | null;
  responseEffortTolerance: string | null;
}

function bullets(label: string, items: string[]): string[] {
  if (items.length === 0) return [];
  return [`- ${label}: ${items.join('; ')}`];
}

function fmtMoney(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const lo = min == null ? 'any' : `$${min.toLocaleString()}`;
  const hi = max == null ? 'any' : `$${max.toLocaleString()}`;
  return `${lo} to ${hi}`;
}

export function buildContractorBlock(c: ScoringContractor): string {
  const lines: string[] = ['Contractor profile:'];
  if (c.capabilitySummary) lines.push(`- Capability: ${c.capabilitySummary}`);
  lines.push(...bullets('Certifications held', c.certifications));
  lines.push(...bullets('Primary NAICS', c.primaryNaics));
  lines.push(...bullets('Secondary NAICS', c.secondaryNaics));
  lines.push(...bullets('Set-asides eligible to pursue', c.setAsideTypes));

  const placeBits: string[] = [];
  if (c.placeOfPerformance.nationwide) placeBits.push('nationwide');
  if (c.placeOfPerformance.remote) placeBits.push('remote');
  if (c.placeOfPerformance.states.length) placeBits.push(`states ${c.placeOfPerformance.states.join(', ')}`);
  if (placeBits.length) lines.push(`- Will perform: ${placeBits.join(' / ')}`);
  if (c.hqState) lines.push(`- HQ state: ${c.hqState}`);

  const range = fmtMoney(c.valueMin, c.valueMax);
  if (range) lines.push(`- Contract value range: ${range}`);
  if (c.role) lines.push(`- Role: ${c.role}`);

  if (
    c.walkAwaySignals.length ||
    c.differentiators.length ||
    c.incumbentDisplacementAppetite ||
    c.teamingPosture ||
    c.responseEffortTolerance
  ) {
    lines.push('Tacit judgment (the wedge — score against these explicitly):');
    lines.push(...bullets('Walk-away signals', c.walkAwaySignals));
    lines.push(...bullets('Differentiators', c.differentiators));
    if (c.incumbentDisplacementAppetite)
      lines.push(`- Incumbent-displacement appetite: ${c.incumbentDisplacementAppetite}`);
    if (c.teamingPosture) lines.push(`- Teaming posture: ${c.teamingPosture}`);
    if (c.responseEffortTolerance)
      lines.push(`- Response-effort tolerance: ${c.responseEffortTolerance}`);
  }
  return lines.join('\n');
}

// The opportunity goes in the user-message turn (not the system block) so
// the system block stays identical across all N scoring calls and cache_control
// on the system text yields a real prompt-cache hit per user per run.
export function buildOpportunityBlock(opp: NormalizedOpportunity): string {
  const lines: string[] = ['Score this opportunity:'];
  lines.push(`- Notice type: ${opp.noticeType}`);
  lines.push(`- Title: ${opp.title}`);
  if (opp.department) lines.push(`- Agency: ${opp.department}`);
  if (opp.naicsCode) lines.push(`- NAICS: ${opp.naicsCode}`);
  if (opp.pscCode) lines.push(`- PSC: ${opp.pscCode}`);
  lines.push(`- Set-aside: ${opp.setAsideType ?? 'Full and Open / Unrestricted'}`);
  if (opp.responseDeadline) lines.push(`- Response deadline: ${opp.responseDeadline}`);
  if (opp.placeOfPerformance) {
    lines.push(`- Place of performance: ${JSON.stringify(opp.placeOfPerformance)}`);
  }
  if (opp.solicitationNumber) lines.push(`- Solicitation #: ${opp.solicitationNumber}`);
  if (opp.descriptionText) {
    // Trim long descriptions — Haiku will still get the gist and we stay
    // cheap. 4000 chars is roughly 1000 tokens; cap is a budget guardrail.
    const text = opp.descriptionText.length > 4000
      ? `${opp.descriptionText.slice(0, 4000)}...[truncated]`
      : opp.descriptionText;
    lines.push(`- Description:\n${text}`);
  } else {
    lines.push('- Description: (not yet retrieved)');
  }
  return lines.join('\n');
}
