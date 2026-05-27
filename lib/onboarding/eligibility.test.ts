import { describe, expect, it } from 'vitest';
import { deriveSetAsides, validatePreferences } from './eligibility';

describe('deriveSetAsides', () => {
  it('derives eligible set-asides from held certs, including small-business', () => {
    const out = deriveSetAsides(['8(a)', 'WOSB']);
    expect(out).toContain('8(a) Sole Source');
    expect(out).toContain('8(a) Competitive');
    expect(out).toContain('WOSB');
    expect(out).toContain('Total Small Business');
    expect(out).toContain('Partial Small Business');
  });

  it('returns nothing for no certs', () => {
    expect(deriveSetAsides([])).toEqual([]);
  });

  it('treats EDWOSB as also eligible for WOSB', () => {
    expect(deriveSetAsides(['EDWOSB'])).toContain('WOSB');
  });
});

describe('validatePreferences', () => {
  const remoteEverywhere = { states: [], remote: true, nationwide: true };

  it('flags pursuing a set-aside without the required cert', () => {
    const w = validatePreferences({
      certsGranted: [],
      certsPursuing: [],
      setAsideTypes: ['WOSB'],
      placeOfPerformance: { states: [], remote: false, nationwide: false },
    });
    expect(w.some((x) => x.field === 'setAsideTypes')).toBe(true);
  });

  it('does not flag a set-aside the user is certified for', () => {
    const w = validatePreferences({
      certsGranted: ['WOSB'],
      certsPursuing: [],
      setAsideTypes: ['WOSB', 'Total Small Business'],
      placeOfPerformance: { states: [], remote: false, nationwide: false },
    });
    expect(w.some((x) => x.field === 'setAsideTypes')).toBe(false);
  });

  it('flags the HUBZone + fully-remote-everywhere tension', () => {
    const w = validatePreferences({
      certsGranted: ['HUBZone'],
      certsPursuing: [],
      setAsideTypes: ['HUBZone'],
      placeOfPerformance: remoteEverywhere,
    });
    expect(w.some((x) => x.field === 'hubzone')).toBe(true);
  });

  it('does not flag HUBZone tension when an HQ state is set', () => {
    const w = validatePreferences({
      certsGranted: ['HUBZone'],
      certsPursuing: [],
      setAsideTypes: ['HUBZone'],
      placeOfPerformance: remoteEverywhere,
      hqState: 'VA',
    });
    expect(w.some((x) => x.field === 'hubzone')).toBe(false);
  });
});
