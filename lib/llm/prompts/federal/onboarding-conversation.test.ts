import { describe, expect, it } from 'vitest';
import { buildConversationContext } from './onboarding-conversation';

describe('buildConversationContext', () => {
  it('summarizes known preferences and enrichment so the model skips them', () => {
    const ctx = buildConversationContext(
      {
        certifications: ['8(a)'],
        primary_naics: ['541512'],
        set_aside_types: ['8(a) Competitive'],
        role: 'prime',
        value_band: 'above_sat',
      },
      { capabilitySummary: 'Cloud migration for agencies.', differentiators: ['FedRAMP'] },
    );
    expect(ctx).toContain('541512');
    expect(ctx).toContain('Cloud migration for agencies.');
    expect(ctx).toContain('FedRAMP');
    expect(ctx).toContain('8(a)');
  });

  it('falls back gracefully when nothing is known', () => {
    expect(buildConversationContext(null, null)).toMatch(/No company context/);
  });
});
