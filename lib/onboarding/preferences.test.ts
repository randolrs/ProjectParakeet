import { describe, expect, it } from 'vitest';
import { parsePreferencesForm } from './preferences';

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v));
    else fd.set(key, value);
  }
  return fd;
}

const valid = {
  certifications: ['8(a)', 'WOSB'],
  primaryNaics: '541512, 541519',
  secondaryNaics: '518210',
  pscCodes: 'd307, r425',
  setAsideTypes: ['8(a) Competitive', 'WOSB'],
  states: ['VA', 'MD'],
  remote: 'on',
  valueBand: 'above_sat',
  role: 'prime',
  agenciesOfInterest: 'Department of Defense\nGSA',
  agenciesExcluded: 'Department of Energy',
  noticeTypes: ['Solicitation', 'Sources Sought'],
};

describe('parsePreferencesForm', () => {
  it('parses a complete, valid form', () => {
    const result = parsePreferencesForm(form(valid));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.primaryNaics).toEqual(['541512', '541519']);
    expect(result.data.pscCodes).toEqual(['D307', 'R425']); // uppercased
    expect(result.data.placeOfPerformance).toEqual({
      states: ['VA', 'MD'],
      remote: true,
      nationwide: false,
    });
    expect(result.data.agenciesOfInterest).toEqual(['Department of Defense', 'GSA']);
  });

  it('requires at least one primary NAICS code', () => {
    const result = parsePreferencesForm(form({ ...valid, primaryNaics: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects malformed NAICS codes', () => {
    const result = parsePreferencesForm(form({ ...valid, primaryNaics: '54151' }));
    expect(result.success).toBe(false);
  });

  it('rejects an unknown certification', () => {
    const result = parsePreferencesForm(form({ ...valid, certifications: ['MBE'] }));
    expect(result.success).toBe(false);
  });

  it('rejects an invalid value band', () => {
    const result = parsePreferencesForm(form({ ...valid, valueBand: 'huge' }));
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-scope notice type', () => {
    const result = parsePreferencesForm(form({ ...valid, noticeTypes: ['Award Notice'] }));
    expect(result.success).toBe(false);
  });

  it('defaults unchecked place-of-performance flags to false', () => {
    const fd = form(valid);
    fd.delete('remote');
    const result = parsePreferencesForm(fd);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.placeOfPerformance.remote).toBe(false);
  });
});
