import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { fetchJson } from '@/lib/http';
import { anthropic, MODELS, withClaudeLogging } from '@/lib/llm/client';
import { WEBSITE_EXTRACTION_PROMPT } from '@/lib/llm/prompts/federal/website-extraction';

export const ExtractedCompanySchema = z.object({
  naics: z.array(z.string()),
  psc: z.array(z.string()),
  capabilitySummary: z.string(),
  differentiators: z.array(z.string()),
});
export type ExtractedCompany = z.infer<typeof ExtractedCompanySchema>;

// Source-agnostic crawl behind an interface, mirroring OpportunitySource. The
// FireCrawl impl normalizes at its own boundary with Zod.
export interface CompanyEnrichmentSource {
  readonly name: string;
  scrape(url: string): Promise<string>;
}

const FirecrawlScrapeResponse = z.object({
  success: z.boolean().optional(),
  data: z.object({ markdown: z.string().optional() }).optional(),
});

export class FirecrawlSource implements CompanyEnrichmentSource {
  readonly name = 'firecrawl';

  async scrape(url: string): Promise<string> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set.');

    const raw = await fetchJson(
      'https://api.firecrawl.dev/v1/scrape',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      },
      { timeoutMs: 45_000, retries: 3, context: { source: 'firecrawl' } },
    );

    return FirecrawlScrapeResponse.parse(raw).data?.markdown ?? '';
  }
}

export function getEnrichmentSource(): CompanyEnrichmentSource {
  return new FirecrawlSource();
}

const NAICS_RE = /^\d{6}$/;
const PSC_RE = /^[A-Z0-9]{4}$/;

// Pure post-processing of the model's extraction: drop malformed codes, cap
// differentiators. Separated for unit testing (LLM-output parsing).
export function sanitizeExtracted(out: ExtractedCompany): ExtractedCompany {
  return {
    naics: out.naics.filter((c) => NAICS_RE.test(c)),
    psc: out.psc.map((c) => c.toUpperCase()).filter((c) => PSC_RE.test(c)),
    capabilitySummary: out.capabilitySummary.trim(),
    differentiators: out.differentiators.map((d) => d.trim()).filter(Boolean).slice(0, 5),
  };
}

// Extracts a structured company profile from crawled markdown via Sonnet 4.6
// structured output, then drops any malformed codes the model returned.
export async function extractCompany(markdown: string): Promise<ExtractedCompany> {
  const content = markdown.slice(0, 24_000); // bound token cost
  if (!content.trim()) {
    return { naics: [], psc: [], capabilitySummary: '', differentiators: [] };
  }

  const res = await withClaudeLogging({ op: 'website_extraction' }, () =>
    anthropic().messages.parse({
      model: MODELS.onboarding,
      max_tokens: 2048,
      system: [
        { type: 'text', text: WEBSITE_EXTRACTION_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: `Company website content:\n\n${content}` }],
      output_config: { format: zodOutputFormat(ExtractedCompanySchema) },
    }),
  );

  return sanitizeExtracted(
    res.parsed_output ?? { naics: [], psc: [], capabilitySummary: '', differentiators: [] },
  );
}
