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
  certsGranted: ['8(a)', 'WOSB'],
  certsPursuing: ['HUBZone'],
  primaryNaics: ['541512'], // confirmed suggestion (checkbox)
  primaryNaicsAdd: '541519', // hand-added
  secondaryNaics: '518210',
  pscCodes: 'd307',
  keywords: 'managed IT, helpdesk',
  contractVehicles: ['GSA Schedule'],
  widenFullOpen: 'on',
  states: ['VA'],
  remote: 'on',
  hqState: 'VA',
  valueMin: '$50,000',
  valueMax: '$2,000,000',
  annualRevenueUsd: '5,000,000',
  employeeCount: '40',
  samRegistered: 'on',
  hasUei: 'on',
  role: 'prime',
  agenciesOfInterest: 'Department of Defense',
  agenciesExcluded: 'Department of Energy',
  noticeTypes: ['Sources Sought', 'Award Notice'],
};

describe('parsePreferencesForm', () => {
  it('parses a complete form and derives set-asides from held certs', () => {
    const result = parsePreferencesForm(form(valid));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const d = result.data;
    expect(d.primaryNaics).toEqual(['541512', '541519']);
    expect(d.pscCodes).toEqual(['D307']);
    expect(d.keywords).toEqual(['managed IT', 'helpdesk']);
    expect(d.valueMin).toBe(50000);
    expect(d.valueMax).toBe(2000000);
    expect(d.annualRevenueUsd).toBe(5000000);
    expect(d.employeeCount).toBe(40);
    expect(d.samRegistered).toBe(true);
    // Set-asides are derived, not collected
    expect(d.setAsideTypes).toContain('8(a) Sole Source');
    expect(d.setAsideTypes).toContain('WOSB');
    expect(d.setAsideTypes).toContain('Total Small Business');
    expect(d.setAsideTypes).toContain('full and open'); // widened
  });

  it('does not add full-and-open unless widened', () => {
    const fd = form(valid);
    fd.delete('widenFullOpen');
    const result = parsePreferencesForm(fd);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.setAsideTypes).not.toContain('full and open');
  });

  it('requires at least one keyword or NAICS code', () => {
    const result = parsePreferencesForm(
      form({ ...valid, keywords: '', primaryNaics: [], primaryNaicsAdd: '' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects malformed NAICS codes', () => {
    const result = parsePreferencesForm(form({ ...valid, primaryNaicsAdd: '54151' }));
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-scope notice type', () => {
    const result = parsePreferencesForm(form({ ...valid, noticeTypes: ['Justification'] }));
    expect(result.success).toBe(false);
  });
});
