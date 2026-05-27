import { describe, expect, it } from 'vitest';
import { BID_PROFILE_TOOL, BidProfileSchema } from './bid-profile';

describe('BidProfileSchema', () => {
  it('parses a well-formed tool input', () => {
    const r = BidProfileSchema.safeParse({
      walkAwaySignals: ['no incumbent intel', 'unrealistic timeline'],
      incumbentDisplacementAppetite: 'Only if the incumbent is weak and we have a past-performance edge.',
      teamingPosture: 'Prime when we hold the NAICS; sub to primes we trust on larger vehicles.',
      responseEffortTolerance: 'High effort only above ~40% Pwin.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects wrong field types', () => {
    const r = BidProfileSchema.safeParse({
      walkAwaySignals: 'should be an array',
      incumbentDisplacementAppetite: 'x',
      teamingPosture: 'y',
      responseEffortTolerance: 'z',
    });
    expect(r.success).toBe(false);
  });
});

describe('BID_PROFILE_TOOL', () => {
  it('is a strict tool requiring the four judgment fields', () => {
    expect(BID_PROFILE_TOOL.strict).toBe(true);
    expect(BID_PROFILE_TOOL.input_schema.required).toEqual([
      'walkAwaySignals',
      'incumbentDisplacementAppetite',
      'teamingPosture',
      'responseEffortTolerance',
    ]);
    expect(BID_PROFILE_TOOL.input_schema.additionalProperties).toBe(false);
  });
});
