import { afterEach, describe, expect, it, vi } from 'vitest';
import { SamDirectSource } from './sam-direct-source';
import { NormalizedOpportunitySchema } from './types';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// Representative SAM.gov Opportunities API v2 response (one record).
const SAM_FIXTURE = {
  totalRecords: 1,
  limit: 10,
  offset: 0,
  opportunitiesData: [
    {
      noticeId: 'abc123',
      title: 'Base Janitorial Services',
      solicitationNumber: 'W912-26-R-0001',
      fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.AMC.W4GG',
      postedDate: '2026-01-01',
      type: 'Solicitation',
      typeOfSetAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)',
      typeOfSetAside: 'SBA',
      responseDeadLine: '2026-02-01T17:00:00-05:00',
      naicsCode: '561720',
      classificationCode: 'S201',
      description:
        'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc123',
      pointOfContact: [
        { type: 'primary', fullName: 'Jane Doe', email: 'jane.doe@army.mil' },
      ],
      placeOfPerformance: { city: { name: 'Fort Liberty' }, state: { code: 'NC' } },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SamDirectSource (fixture)', () => {
  it('parses a SAM v2 response into NormalizedOpportunity with description NOT inline', async () => {
    vi.stubEnv('SAM_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(SAM_FIXTURE)));

    const source = new SamDirectSource();
    const results = await source.search({
      postedFrom: '01/01/2026',
      postedTo: '01/02/2026',
      noticeTypes: ['Solicitation'],
      naics: '561720',
      limit: 10,
      offset: 0,
    });

    expect(results).toHaveLength(1);
    const opp = results[0];
    expect(() => NormalizedOpportunitySchema.parse(opp)).not.toThrow();

    expect(opp.jurisdiction).toBe('federal');
    expect(opp.externalNoticeId).toBe('abc123');
    expect(opp.noticeType).toBe('Solicitation');
    expect(opp.naicsCode).toBe('561720');
    expect(opp.pscCode).toBe('S201');
    expect(opp.setAsideType).toBe('Total Small Business Set-Aside (FAR 19.5)');
    expect(opp.department).toBe('DEPT OF DEFENSE');
    expect(opp.office).toBe('W4GG');
    // descriptionsInline is false for SAM: text absent, URL present.
    expect(opp.descriptionText).toBeNull();
    expect(opp.descriptionUrl).toContain('noticedesc');
    expect(opp.pointOfContact).toMatchObject({ fullName: 'Jane Doe' });
  });

  it('declares descriptionsInline=false and a per-day budget', () => {
    const source = new SamDirectSource();
    expect(source.capabilities.descriptionsInline).toBe(false);
    expect(source.capabilities.requestBudget.perDay).toBe(1000);
  });

  it('fetchDescription resolves the description endpoint payload', async () => {
    vi.stubEnv('SAM_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ description: 'Full solicitation text.' })),
    );
    const source = new SamDirectSource();
    const text = await source.fetchDescription(
      NormalizedOpportunitySchema.parse({
        jurisdiction: 'federal',
        externalNoticeId: 'abc123',
        solicitationNumber: null,
        title: 'X',
        department: null,
        subTier: null,
        office: null,
        noticeType: 'Solicitation',
        naicsCode: null,
        pscCode: null,
        setAsideType: null,
        postedDate: '2026-01-01T00:00:00.000Z',
        responseDeadline: null,
        placeOfPerformance: null,
        descriptionUrl: 'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc123',
        descriptionText: null,
        pointOfContact: null,
        rawData: {},
      }),
    );
    expect(text).toBe('Full solicitation text.');
  });
});

// Real request — skips without a key. HARD CAP: exactly one search() call,
// no loop, no description fetch (SAM may be 10/day pre-registration).
describe('SamDirectSource (real)', () => {
  const fmt = (d: Date): string =>
    `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

  it.skipIf(!process.env.SAM_API_KEY)(
    'parses a real 2-day window; descriptions are not inline',
    async () => {
      const source = new SamDirectSource();
      const to = new Date();
      const from = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const results = await source.search({
        postedFrom: fmt(from),
        postedTo: fmt(to),
        noticeTypes: [
          'Solicitation',
          'Combined Synopsis/Solicitation',
          'Presolicitation',
          'Sources Sought',
        ],
        limit: 10,
        offset: 0,
      });
      expect(Array.isArray(results)).toBe(true);
      for (const opp of results) {
        expect(() => NormalizedOpportunitySchema.parse(opp)).not.toThrow();
        expect(opp.descriptionText).toBeNull();
      }
    },
    30_000,
  );
});
