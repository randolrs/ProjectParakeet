import { GovConApiSource } from './govconapi-source';
import { SamDirectSource } from './sam-direct-source';
import { type OpportunitySource } from './types';

export * from './types';
export { GovConApiSource } from './govconapi-source';
export { SamDirectSource } from './sam-direct-source';

export type OpportunitySourceName = 'govconapi' | 'sam';

// Selected by env. Default is GovConAPI (v1 primary). Downstream code must
// read source.capabilities and never branch on the source name itself.
export function getActiveSource(
  name: string | undefined = process.env.OPPORTUNITY_SOURCE,
): OpportunitySource {
  const selected = (name ?? 'govconapi').toLowerCase();
  switch (selected) {
    case 'govconapi':
      return new GovConApiSource();
    case 'sam':
      return new SamDirectSource();
    default:
      throw new Error(
        `Unknown OPPORTUNITY_SOURCE "${selected}"; expected "govconapi" or "sam".`,
      );
  }
}
