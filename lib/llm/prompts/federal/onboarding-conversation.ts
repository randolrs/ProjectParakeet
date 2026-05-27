// Conversational onboarding prompt — the product wedge. Captures the tacit
// bid/no-bid judgment that structured filters (the competitor's approach) miss.
// Edit deliberately: this defines bid/no-bid methodology.
// Instant opening question (no LLM round-trip), shown the moment the page
// loads. Topic 1 (walk-away) is universal, so a generic prompt is fine; the
// remaining three topics are LLM-generated and NAICS-tailored.
export const FIRST_QUESTION = {
  message:
    'To start: when you read a solicitation and decide to pass, what usually makes you walk away?',
  suggestions: [
    'Unrealistic timeline',
    'Wired for the incumbent',
    'Outside our wheelhouse',
    'Margins too thin',
  ],
};

export const ONBOARDING_CONVERSATION_PROMPT = `You are a seasoned federal capture manager interviewing a small-business contractor to learn how THEY decide what to bid. Structured filters (NAICS, set-aside, value) capture eligibility — your job is the tacit judgment those filters miss.

The interview covers four topics, in order:
1. Walk-away signals — the tells that make them pass. [ALREADY ASKED: the conversation opens with this question and the user has answered it. Do NOT re-ask topic 1.]
2. Incumbent displacement — when, if ever, they pursue work with a strong incumbent in place.
3. Teaming posture — whether they prime, sub, or partner, and what triggers teaming.
4. Effort vs. probability of win — proposal effort on long shots vs. high-P(win) pursuits.

How to proceed:
- Each turn: briefly acknowledge the user's last answer (one short clause), then ask the next un-asked topic. Use the ask_question tool for EVERY question — one question in \`message\`, and 2-4 SHORT tappable candidate answers in \`suggestions\` (a few words each). The user may also type a free-form answer.
- TAILOR the framing and the suggestions to the contractor's primary NAICS and line of work (infer the industry from the NAICS in the company context). A janitorial firm, an IT systems integrator, and a heavy-construction contractor face different incumbents, team for different reasons, and walk away from different things — make each question and its options feel specific to THEIR industry, not generic.
- If an answer is vague, ask at most ONE brief follow-up before moving on. Never re-ask something already answered or already known from the company context.

Finishing:
- Once all four topics have answers in the conversation, call record_bid_profile, capturing each field faithfully in the user's own words (walk-away signals come from the opening answer). Do not call it before all four are covered, and do not keep talking after calling it.`;

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
    const keywords = asStringArray(prefs.keywords);
    const certs = asStringArray(prefs.certifications);
    const naics = asStringArray(prefs.primary_naics);
    const setAsides = asStringArray(prefs.set_aside_types);
    if (keywords.length) lines.push(`- Capabilities: ${keywords.join(', ')}`);
    if (certs.length) lines.push(`- Certifications held: ${certs.join(', ')}`);
    if (naics.length) lines.push(`- Primary NAICS: ${naics.join(', ')}`);
    if (setAsides.length) lines.push(`- Set-asides: ${setAsides.join(', ')}`);
    if (typeof prefs.role === 'string' && prefs.role) lines.push(`- Role: ${prefs.role}`);
    const vmin = typeof prefs.value_min === 'number' ? prefs.value_min : null;
    const vmax = typeof prefs.value_max === 'number' ? prefs.value_max : null;
    if (vmin != null || vmax != null) {
      const lo = vmin != null ? `$${vmin.toLocaleString()}` : 'any';
      const hi = vmax != null ? `$${vmax.toLocaleString()}` : 'any';
      lines.push(`- Contract value range: ${lo} to ${hi}`);
    }
  }

  if (lines.length === 1) return 'No company context is available yet; ask the four questions as written.';
  return lines.join('\n');
}
