import { z } from 'zod';
import { FEDERAL_VOCABULARY } from '@/lib/opportunities/jurisdictions/federal';

// Option sets for the deterministic onboarding form. Certifications, set-aside
// types, and notice types come from the federal jurisdiction vocabulary so the
// form, scoring, and ingest never drift apart.
export const CERTIFICATIONS = FEDERAL_VOCABULARY.certifications;
export const SET_ASIDE_TYPES = FEDERAL_VOCABULARY.setAsideTypes;
export const NOTICE_TYPES = FEDERAL_VOCABULARY.noticeTypes;

export const VALUE_BAND_VALUES = ['micro_purchase', 'sat', 'above_sat', 'large'] as const;
export type ValueBand = (typeof VALUE_BAND_VALUES)[number];
export const VALUE_BAND_LABELS: Record<ValueBand, string> = {
  micro_purchase: 'Micro-purchase (≤ $10k)',
  sat: 'Simplified acquisition threshold (≤ $250k)',
  above_sat: 'Above SAT',
  large: 'Large',
};

export const ROLE_VALUES = ['prime', 'sub', 'both'] as const;
export type Role = (typeof ROLE_VALUES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  prime: 'Prime',
  sub: 'Subcontractor',
  both: 'Both',
};

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

const inSet = (allowed: readonly string[]) =>
  z.array(z.string().refine((v) => allowed.includes(v), { message: 'Unknown option' }));

const PlaceOfPerformanceSchema = z.object({
  states: z.array(z.string().refine((s) => (US_STATES as readonly string[]).includes(s))),
  remote: z.boolean(),
  nationwide: z.boolean(),
});
export type PlaceOfPerformance = z.infer<typeof PlaceOfPerformanceSchema>;

export const CompanyPreferencesSchema = z.object({
  certifications: inSet(CERTIFICATIONS),
  primaryNaics: z
    .array(z.string().regex(/^\d{6}$/, 'NAICS codes are 6 digits'))
    .min(1, 'Add at least one primary NAICS code'),
  secondaryNaics: z.array(z.string().regex(/^\d{6}$/, 'NAICS codes are 6 digits')),
  pscCodes: z.array(z.string().regex(/^[A-Z0-9]{4}$/, 'PSC codes are 4 characters')),
  setAsideTypes: inSet(SET_ASIDE_TYPES),
  placeOfPerformance: PlaceOfPerformanceSchema,
  valueBand: z.enum(VALUE_BAND_VALUES),
  role: z.enum(ROLE_VALUES),
  agenciesOfInterest: z.array(z.string().min(1)),
  agenciesExcluded: z.array(z.string().min(1)),
  noticeTypes: inSet(NOTICE_TYPES),
});
export type CompanyPreferencesInput = z.infer<typeof CompanyPreferencesSchema>;

function splitList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const isChecked = (raw: FormDataEntryValue | null) => raw === 'on' || raw === 'true';

// Pure FormData -> validated preferences. Kept free of Next/Supabase imports so
// it is unit-testable in isolation.
export function parsePreferencesForm(formData: FormData) {
  const raw = {
    certifications: formData.getAll('certifications').map(String),
    primaryNaics: splitList(formData.get('primaryNaics')),
    secondaryNaics: splitList(formData.get('secondaryNaics')),
    pscCodes: splitList(formData.get('pscCodes')).map((s) => s.toUpperCase()),
    setAsideTypes: formData.getAll('setAsideTypes').map(String),
    placeOfPerformance: {
      states: formData.getAll('states').map(String),
      remote: isChecked(formData.get('remote')),
      nationwide: isChecked(formData.get('nationwide')),
    },
    valueBand: formData.get('valueBand'),
    role: formData.get('role'),
    agenciesOfInterest: splitList(formData.get('agenciesOfInterest')),
    agenciesExcluded: splitList(formData.get('agenciesExcluded')),
    noticeTypes: formData.getAll('noticeTypes').map(String),
  };
  return CompanyPreferencesSchema.safeParse(raw);
}
