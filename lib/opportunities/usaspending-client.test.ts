import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchAwards } from './usaspending-client';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const USASPENDING_FIXTURE = {
  results: [
    {
      'Award ID': 'CONT_AWD_123',
      'Recipient Name': 'Acme Federal LLC',
      'Award Amount': 1250000.5,
      'Awarding Agency': 'Department of Defense',
      'Awarding Sub Agency': 'Department of the Army',
      'Start Date': '2024-03-01',
      'End Date': '2025-02-28',
      'Award Type': 'Definitive Contract',
    },
  ],
  page_metadata: { page: 1, hasNext: false },
};

afterEach(() => vi.unstubAllGlobals());

describe('searchAwards (fixture)', () => {
  it('parses USAspending results into typed awards', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(USASPENDING_FIXTURE)));
    const awards = await searchAwards({ naics: '561720', limit: 5 });
    expect(awards).toHaveLength(1);
    expect(awards[0]).toMatchObject({
      awardId: 'CONT_AWD_123',
      recipientName: 'Acme Federal LLC',
      awardAmount: 1250000.5,
      awardingAgency: 'Department of Defense',
    });
  });

  it('is best-effort: returns [] when the API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'boom' }, 500)));
    const awards = await searchAwards({ naics: '561720' });
    expect(awards).toEqual([]);
  });
});

describe('searchAwards (real)', () => {
  it.skipIf(!process.env.RUN_NETWORK_TESTS)(
    'fetches real awards for a sample NAICS and parses cleanly',
    async () => {
      const awards = await searchAwards({ naics: '541330', limit: 5 });
      expect(Array.isArray(awards)).toBe(true);
    },
    30_000,
  );
});
