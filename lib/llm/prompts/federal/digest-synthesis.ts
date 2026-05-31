import type Anthropic from '@anthropic-ai/sdk';

// Sonnet 4.6 generates a 2-3 sentence header for the day's digest. Per-opp
// reasoning was already produced by Haiku in the scoring step; the only
// cross-opp awareness Sonnet needs to add is the TL;DR — "what's the shape
// of today's set?" — so the email opens with signal, not a wall of cards.
// Edit deliberately: this defines digest tone.

export const DIGEST_HEADER_PROMPT = `You are a federal capture manager writing the opening of a contractor's morning digest email. The contractor has already had every opportunity individually scored — you're NOT re-evaluating, you're framing the day.

Given the scored entries (rank, recommendation, fit, deadline, title), write a 2-3 sentence header the contractor reads first. Concrete and useful, not promotional.

What to convey:
- Shape of the day in plain numbers ("4 strong bids, 3 to watch for teaming, 2 deadline-imminent").
- Anything unusual or notable that's evident from the SCORES YOU WERE GIVEN: a primary-NAICS bullseye, a deadline closing inside 72 hours, a clustering pattern (e.g. "all four bids are 8(a) — your incumbent advantage").
- DO NOT invent agency / NAICS / dollar facts beyond what appears in the entries you were given.
- DO NOT use marketing language ("exciting opportunity!", "great matches today!"). The reader is a capture manager; talk to them like one.
- DO NOT recommend ordering changes; the ranking is fixed.

Call write_digest_header exactly once.`;

export const DIGEST_HEADER_TOOL: Anthropic.Tool = {
  name: 'write_digest_header',
  description: 'Write the 2-3 sentence opener for the digest email.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['header'],
    properties: {
      header: {
        type: 'string',
        minLength: 1,
        maxLength: 600,
        description:
          '2-3 sentences, plain English, no marketing language. References only facts from the supplied entries.',
      },
    },
  },
};

// Compact summary fed to the model — one line per entry. Sonnet doesn't need
// the full reasoning_text (already-fixed per-opp); it just needs the shape.
export interface SynthesisEntry {
  rank: number;
  title: string;
  noticeType: string;
  fitScore: number;
  bidRecommendation: 'bid' | 'no_bid' | 'watch';
  agency: string | null;
  setAside: string | null;
  responseDeadline: string | null; // ISO
}

function fmtDeadline(now: Date, iso: string | null): string {
  if (!iso) return 'no deadline';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'no deadline';
  const hours = Math.round((d.getTime() - now.getTime()) / 36e5);
  if (hours < 0) return 'past';
  if (hours < 72) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function buildEntriesBlock(entries: SynthesisEntry[], now: Date = new Date()): string {
  const lines = entries.map(
    (e) =>
      `#${e.rank} ${e.bidRecommendation.toUpperCase()} fit=${e.fitScore} ` +
      `[${e.noticeType}] [${e.setAside ?? 'open'}] ${e.agency ?? '?'} — ` +
      `${e.title} (deadline: ${fmtDeadline(now, e.responseDeadline)})`,
  );
  return ['Today\'s scored entries (rank order is fixed):', ...lines].join('\n');
}
