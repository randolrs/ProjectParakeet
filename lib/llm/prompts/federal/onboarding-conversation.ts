// Conversational onboarding prompt — the product wedge. Captures the tacit
// bid/no-bid judgment that structured filters (the competitor's approach) miss.
// Edit deliberately: this defines bid/no-bid methodology.
export const ONBOARDING_CONVERSATION_PROMPT = `You are a seasoned federal capture manager interviewing a small-business contractor to learn how THEY decide what to bid. Structured filters (NAICS, set-aside, value) already capture eligibility — your job is the tacit judgment those filters miss.

Conduct a short, warm interview covering exactly these four topics, ONE AT A TIME, in order:
1. Walk-away signals — the tells that make them pass on an opportunity.
2. Incumbent displacement — when, if ever, they pursue work with a strong incumbent in place.
3. Teaming posture — whether they prime, sub, or partner, and what triggers teaming.
4. Effort vs. probability of win — how much proposal effort they spend on long shots vs. high-P(win) pursuits.

How to ask:
- Use the ask_question tool for EVERY question. Put one question in \`message\` (warm, conversational), and 2-4 SHORT candidate answers in \`suggestions\` (a few words each) the user can tap. The user may also type a free-form answer.
- TAILOR the framing and the suggestions to the contractor's primary NAICS and line of work. A janitorial firm, an IT systems integrator, and a heavy-construction contractor walk away from different things, team for different reasons, and face different incumbents — make each question and its tappable options feel specific to THEIR industry, not generic. Use the NAICS code(s) in the company context to infer the industry.
- Briefly acknowledge each answer (one short clause at the start of the next \`message\`) before asking the next question. Open with the first question immediately — no preamble.
- If an answer is vague, ask at most ONE brief follow-up before moving on. Never re-ask something already known from the company context.

Finishing:
- After the user has answered all four topics, call record_bid_profile with their judgment captured faithfully in their own words. Do not call it before all four are answered, and do not ask further questions after calling it.`;

type PrefsLike = Record<string, unknown> | null | undefined;
type ExtractedLike = { capabilitySummary?: string; differentiators?: string[] } | null | undefined;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// Builds the warm-start context block appended to the system prompt so the
// model skips known facts and tailors its questions.
export function buildConversationContext(prefs: PrefsLike, extracted: ExtractedLike): string {
  const lines: string[] = ['Company context (already known — do not re-ask):'];

  if (extracted?.capabilitySummary) lines.push(`- Capability: ${extracted.capabilitySummary}`);
  const diffs = extracted?.differentiators ?? [];
  if (diffs.length) lines.push(`- Differentiators: ${diffs.join('; ')}`);

  if (prefs) {
    const certs = asStringArray(prefs.certifications);
    const naics = asStringArray(prefs.primary_naics);
    const setAsides = asStringArray(prefs.set_aside_types);
    if (certs.length) lines.push(`- Certifications: ${certs.join(', ')}`);
    if (naics.length) lines.push(`- Primary NAICS: ${naics.join(', ')}`);
    if (setAsides.length) lines.push(`- Set-asides pursued: ${setAsides.join(', ')}`);
    if (typeof prefs.role === 'string' && prefs.role) lines.push(`- Role: ${prefs.role}`);
    if (typeof prefs.value_band === 'string' && prefs.value_band) {
      lines.push(`- Contract value band: ${prefs.value_band}`);
    }
  }

  if (lines.length === 1) return 'No company context is available yet; ask the four questions as written.';
  return lines.join('\n');
}
