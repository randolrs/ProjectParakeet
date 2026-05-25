import { describe, expect, it } from 'vitest';
import { GovConApiSource, SamDirectSource, getActiveSource } from './index';

describe('getActiveSource', () => {
  it('defaults to GovConAPI when OPPORTUNITY_SOURCE is unset', () => {
    expect(getActiveSource(undefined)).toBeInstanceOf(GovConApiSource);
  });

  it('returns GovConApiSource for "govconapi"', () => {
    expect(getActiveSource('govconapi')).toBeInstanceOf(GovConApiSource);
  });

  it('returns SamDirectSource for "sam" (case-insensitive)', () => {
    expect(getActiveSource('SAM')).toBeInstanceOf(SamDirectSource);
  });

  it('throws on an unknown source name', () => {
    expect(() => getActiveSource('mystery')).toThrow(/unknown opportunity_source/i);
  });
});
