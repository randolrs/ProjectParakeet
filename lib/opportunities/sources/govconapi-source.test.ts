import { afterEach, describe, expect, it, vi } from 'vitest';
import { GovConApiSource } from './govconapi-source';
import { NormalizedOpportunitySchema } from './types';

const baseOpp = (descriptionText: string | null) =>
  NormalizedOpportunitySchema.parse({
    jurisdiction: 'federal',
    externalNoticeId: 'gc-1',
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
    descriptionUrl: null,
    descriptionText,
    pointOfContact: null,
    rawData: {},
  });

describe('GovConApiSource', () => {
  it('declares descriptionsInline=false (search returns description_text only for Award Notices) and a per-hour budget', () => {
    const source = new GovConApiSource();
    expect(source.capabilities.descriptionsInline).toBe(false);
    expect(source.capabilities.requestBudget.perHour).toBe(1000);
  });

  it('fetchDescription passes through inline text when search() did populate it (Award Notices)', async () => {
    const source = new GovConApiSource();
    const text = await source.fetchDescription(baseOpp('Inline description text.'));
    expect(text).toBe('Inline description text.');
  });

  describe('fetchDescription detail-endpoint fallback', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    it('fetches the detail endpoint when description_text was empty on the search response', async () => {
      vi.stubEnv('GOVCONAPI_KEY', 'test-key');
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            opportunity: {
              notice_id: 'gc-1',
              description_text: 'Detail-endpoint description.',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const text = await new GovConApiSource().fetchDescription(baseOpp(null));
      expect(text).toBe('Detail-endpoint description.');
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        'https://govconapi.com/api/v1/opportunities/gc-1',
      );
    });

    it('throws if even the detail endpoint has no description_text', async () => {
      vi.stubEnv('GOVCONAPI_KEY', 'test-key');
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ opportunity: { notice_id: 'gc-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await expect(new GovConApiSource().fetchDescription(baseOpp(null))).rejects.toThrow();
    });
  });

  describe('search', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    function mockSearchResponse(body: unknown) {
      return vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    it('hits opportunities/search with Bearer auth, ISO dates, and pagination', async () => {
      vi.stubEnv('GOVCONAPI_KEY', 'test-key');
      const fetchMock = mockSearchResponse({ data: [], pagination: { has_next: false } });

      await new GovConApiSource().search({
        postedFrom: '05/01/2026',
        postedTo: '05/02/2026',
        limit: 50,
        offset: 100,
      });

      const [calledUrl, init] = fetchMock.mock.calls[0];
      const url = String(calledUrl);
      expect(url).toContain('https://govconapi.com/api/v1/opportunities/search');
      expect(url).toContain('date_from=2026-05-01');
      expect(url).toContain('date_to=2026-05-02');
      expect(url).toContain('limit=50');
      expect(url).toContain('offset=100');
      expect(url).toContain('sort_by=posted_date');
      expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
    });

    it('maps a real GovConAPI record to NormalizedOpportunity (inline description, first NAICS/PSC, contact, place of performance)', async () => {
      vi.stubEnv('GOVCONAPI_KEY', 'test-key');
      mockSearchResponse({
        data: [
          {
            notice_id: 'abc123def456',
            title: 'IT Services Contract',
            agency: 'Department of Defense',
            posted_date: '2025-11-01',
            response_deadline: '2025-12-15T17:00:00+00:00',
            naics: ['541330', '541512'],
            psc: ['D307', 'D399'], // array, like naics — was the live bug
            notice_type: 'Solicitation',
            set_aside_type: 'Small Business',
            solicitation_number: 'W52P1J-25-R-0001',
            description_text: 'Full contract requirements...',
            award_amount: 1500000.0,
            awardee_name: 'Tech Solutions Inc',
            contact_name: 'John Smith',
            contact_email: 'john.smith@agency.gov',
            sam_url: 'https://sam.gov/opp/...',
            performance_city_name: 'Washington',
            performance_state_code: 'DC',
          },
        ],
        pagination: { limit: 20, offset: 0, total: 1, has_next: false },
      });

      const { items } = await new GovConApiSource().search({
        postedFrom: '11/01/2025',
        postedTo: '11/02/2025',
        limit: 20,
        offset: 0,
      });

      const o = items[0];
      expect(o.externalNoticeId).toBe('abc123def456');
      expect(o.title).toBe('IT Services Contract');
      expect(o.noticeType).toBe('Solicitation');
      expect(o.naicsCode).toBe('541330'); // first of array
      expect(o.pscCode).toBe('D307'); // first of array
      expect(o.setAsideType).toBe('Small Business');
      expect(o.solicitationNumber).toBe('W52P1J-25-R-0001');
      expect(o.descriptionText).toBe('Full contract requirements...');
      expect(o.placeOfPerformance).toEqual({ city: 'Washington', state: 'DC' });
      expect(o.pointOfContact).toEqual({ name: 'John Smith', email: 'john.smith@agency.gov' });
      expect(o.descriptionUrl).toBe('https://sam.gov/opp/...');
      // Fields not on NormalizedOpportunity (award_amount, awardee_name) survive on rawData.
      expect(o.rawData.award_amount).toBe(1500000);
    });

    it('returns hasNext straight from pagination.has_next (do not infer from item count)', async () => {
      vi.stubEnv('GOVCONAPI_KEY', 'test-key');
      mockSearchResponse({
        data: [{ notice_id: 'x', title: 'one' }],
        pagination: { has_next: true, limit: 50, offset: 0 },
      });
      const page = await new GovConApiSource().search({
        postedFrom: '05/01/2026',
        postedTo: '05/02/2026',
        limit: 100, // intentionally larger than what the source will return
        offset: 0,
      });
      expect(page.hasNext).toBe(true);
      expect(page.items).toHaveLength(1);
    });

    it('handles missing and unexpected field shapes without rejecting the batch', async () => {
      vi.stubEnv('GOVCONAPI_KEY', 'test-key');
      mockSearchResponse({
        data: [
          // Only the two anchor fields present.
          { notice_id: 'n2', title: 'No type given' },
          // psc as a string instead of an array — still maps cleanly.
          { notice_id: 'n3', title: 'String psc', psc: 'R425' },
          // psc as an empty array — null.
          { notice_id: 'n4', title: 'Empty psc array', psc: [] },
        ],
      });

      const { items } = await new GovConApiSource().search({
        postedFrom: '05/01/2026',
        postedTo: '05/02/2026',
        limit: 20,
        offset: 0,
      });

      expect(items).toHaveLength(3);
      expect(items[0].noticeType).toBe('Unknown'); // ingest in-scope filter drops it
      expect(items[1].pscCode).toBe('R425');
      expect(items[2].pscCode).toBeNull();
    });
  });
});
