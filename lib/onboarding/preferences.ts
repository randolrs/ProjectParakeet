import { z } from 'zod';
import { deriveSetAsides } from '@/lib/onboarding/eligibility';
import { FEDERAL_VOCABULARY } from '@/lib/opportunities/jurisdictions/federal';

// Option sets come from the federal jurisdiction vocabulary so the form,
// scoring, and ingest never drift apart.
export const CERTIFICATIONS = FEDERAL_VOCABULARY.certifications;
export const SET_ASIDE_TYPES = FEDERAL_VOCABULARY.setAsideTypes;
export const NOTICE_TYPES = FEDERAL_VOCABULARY.noticeTypes;

// Notice types with plain-English explanations; early-stage ones are checked by
// default (highest value for a small vendor — shape the requirement early).
export const NOTICE_TYPE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  help: string;
  earlyStage: boolean;
}> = [
  {
    value: 'Sources Sought',
    label: 'Sources Sought / RFI',
    help: 'Early market research — your chance to shape the requirement before it is written. Often the highest-value notice for a small vendor.',
    earlyStage: true,
  },
  {
    value: 'Presolicitation',
    label: 'Presolicitation',
    help: 'A heads-up that a solicitation is coming, so you can prep and line up teaming.',
    earlyStage: true,
  },
  {
    value: 'Special Notice',
    label: 'Special Notice',
    help: 'Industry days, draft RFPs, and other pre-solicitation information.',
    earlyStage: true,
  },
  {
    value: 'Combined Synopsis/Solicitation',
    label: 'Combined Synopsis/Solicitation',
    help: 'Synopsis and solicitation in one — usually simpler buys you can act on now.',
    earlyStage: false,
  },
  {
    value: 'Solicitation',
    label: 'Solicitation',
    help: 'A formal RFP/RFQ open for bids.',
    earlyStage: false,
  },
  {
    value: 'Award Notice',
    label: 'Award Notice',
    help: 'Who won what — find teaming targets and time your run at the recompete.',
    earlyStage: false,
  },
];

export const CONTRACT_VEHICLES = ['GSA Schedule', 'GWAC', 'IDIQ', 'BPA'] as const;

export const ROLE_VALUES = ['prime', 'sub', 'both'] as const;
export type Role = (typeof ROLE_VALUES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  prime: 'Prime',
  sub: 'Subcontractor',
  both: 'Both',
};

// Helper text only — value is collected as a min-max range, not a single band.
export const VALUE_THRESHOLDS =
  'Helpers: micro-purchase ≤ $10k · simplified acquisition ≤ $250k · then above-SAT · large.';

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

const naicsCode = z.string().regex(/^\d{6}$/, 'NAICS codes are 6 digits');
const pscCode = z.string().regex(/^[A-Z0-9]{4}$/, 'PSC codes are 4 characters');
const inSet = (allowed: readonly string[]) =>
  z.array(z.string().refine((v) => allowed.includes(v), { message: 'Unknown option' }));
const stateCode = z.string().refine((s) => (US_STATES as readonly string[]).includes(s));

const PlaceOfPerformanceSchema = z.object({
  states: z.array(stateCode),
  remote: z.boolean(),
  nationwide: z.boolean(),
});
export type PlaceOfPerformance = z.infer<typeof PlaceOfPerformanceSchema>;

export const CompanyPreferencesSchema = z
  .object({
    certsGranted: inSet(CERTIFICATIONS),
    certsPursuing: inSet(CERTIFICATIONS),
    primaryNaics: z.array(naicsCode),
    secondaryNaics: z.array(naicsCode),
    pscCodes: z.array(pscCode),
    keywords: z.array(z.string().min(1)),
    contractVehicles: inSet(CONTRACT_VEHICLES),
    setAsideTypes: inSet(SET_ASIDE_TYPES),
    placeOfPerformance: PlaceOfPerformanceSchema,
    hqState: z.string().refine((s) => s === '' || (US_STATES as readonly string[]).includes(s)),
    valueMin: z.number().int().nonnegative().nullable(),
    valueMax: z.number().int().nonnegative().nullable(),
    annualRevenueUsd: z.number().int().nonnegative().nullable(),
    employeeCount: z.number().int().nonnegative().nullable(),
    samRegistered: z.boolean(),
    hasUei: z.boolean(),
    role: z.enum(ROLE_VALUES).optional(),
    agenciesOfInterest: z.array(z.string().min(1)),
    agenciesExcluded: z.array(z.string().min(1)),
    noticeTypes: inSet(NOTICE_TYPES),
  })
  // Capability-first spine: need at least one keyword OR NAICS to match against.
  .refine((d) => d.keywords.length > 0 || d.primaryNaics.length > 0, {
    message: 'Add at least one capability keyword or NAICS code so we have something to match.',
    path: ['keywords'],
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

function parseMoney(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// Pure FormData -> validated preferences. Set-asides are DERIVED from held certs
// (plus an optional widen to full-and-open), never collected as a second list.
export function parsePreferencesForm(formData: FormData) {
  const certsGranted = formData.getAll('certsGranted').map(String);
  const widenFullOpen = isChecked(formData.get('widenFullOpen'));
  const setAsideTypes = [
    ...deriveSetAsides(certsGranted),
    ...(widenFullOpen ? ['full and open'] : []),
  ];

  const primaryNaics = [
    ...formData.getAll('primaryNaics').map(String),
    ...splitList(formData.get('primaryNaicsAdd')),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const roleRaw = formData.get('role');
  const role = typeof roleRaw === 'string' && roleRaw ? roleRaw : undefined;
  const hqRaw = formData.get('hqState');

  const raw = {
    certsGranted,
    certsPursuing: formData.getAll('certsPursuing').map(String),
    primaryNaics,
    secondaryNaics: splitList(formData.get('secondaryNaics')),
    pscCodes: splitList(formData.get('pscCodes')).map((s) => s.toUpperCase()),
    keywords: splitList(formData.get('keywords')),
    contractVehicles: formData.getAll('contractVehicles').map(String),
    setAsideTypes,
    placeOfPerformance: {
      states: formData.getAll('states').map(String),
      remote: isChecked(formData.get('remote')),
      nationwide: isChecked(formData.get('nationwide')),
    },
    hqState: typeof hqRaw === 'string' ? hqRaw : '',
    valueMin: parseMoney(formData.get('valueMin')),
    valueMax: parseMoney(formData.get('valueMax')),
    annualRevenueUsd: parseMoney(formData.get('annualRevenueUsd')),
    employeeCount: parseMoney(formData.get('employeeCount')),
    samRegistered: isChecked(formData.get('samRegistered')),
    hasUei: isChecked(formData.get('hasUei')),
    role,
    agenciesOfInterest: splitList(formData.get('agenciesOfInterest')),
    agenciesExcluded: splitList(formData.get('agenciesExcluded')),
    noticeTypes: formData.getAll('noticeTypes').map(String),
  };
  return CompanyPreferencesSchema.safeParse(raw);
}
