import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// The judgment fields captured by the M2 conversation (Q1/won_setups and the
// adaptive experience probe are out of scope for v1 per founder decision;
// capability_summary + differentiators come from website enrichment).
export const BidProfileSchema = z.object({
  walkAwaySignals: z.array(z.string()),
  incumbentDisplacementAppetite: z.string(),
  teamingPosture: z.string(),
  responseEffortTolerance: z.string(),
});
export type BidProfileInput = z.infer<typeof BidProfileSchema>;

// Strict tool the model calls to terminate the interview. Schema mirrors
// BidProfileSchema; tool input is re-validated with Zod before persisting.
export const BID_PROFILE_TOOL = {
  name: 'record_bid_profile',
  description:
    "Record the contractor's captured bid/no-bid judgment. Call this ONLY after all four interview questions have been answered, never before.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      walkAwaySignals: {
        type: 'array',
        items: { type: 'string' },
        description: 'Concrete tells that make this contractor pass on an opportunity.',
      },
      incumbentDisplacementAppetite: {
        type: 'string',
        description: 'When and whether they pursue opportunities with a strong incumbent.',
      },
      teamingPosture: {
        type: 'string',
        description: 'How they approach teaming (prime / sub / partner) and what triggers it.',
      },
      responseEffortTolerance: {
        type: 'string',
        description: 'Their tolerance for proposal effort relative to probability of win.',
      },
    },
    required: [
      'walkAwaySignals',
      'incumbentDisplacementAppetite',
      'teamingPosture',
      'responseEffortTolerance',
    ],
    additionalProperties: false,
  },
} satisfies Anthropic.Tool;
