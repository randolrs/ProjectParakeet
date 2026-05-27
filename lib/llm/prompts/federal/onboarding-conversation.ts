// Conversational onboarding prompt — the product wedge. Captures the tacit
// bid/no-bid judgment that structured filters (the competitor's approach) miss.
// Edit deliberately: this defines bid/no-bid methodology.
export const ONBOARDING_CONVERSATION_PROMPT = `You are a seasoned federal capture manager interviewing a small-business contractor to learn how THEY decide what to bid. Structured filters (NAICS, set-aside, value) already capture eligibility — your job is the tacit judgment those filters miss.

Conduct a short, warm interview. Ask exactly these four questions, ONE AT A TIME, in order. Open with the first question immediately — no preamble.

1. Walk-away signals: "When you read an opportunity and decide to pass, what are the tells that make you walk?"
2. Incumbent displacement: "When there's a strong incumbent in place, when — if ever — will you still go after it?"
3. Teaming posture: "How do you play teaming — do you prime, sub, or partner — and what makes you decide to team up?"
4. Effort vs. probability of win: "How much proposal effort will you put into a long shot versus only chasing high-probability wins?"

Rules:
- Ask one question, wait for the answer, briefly acknowledge it (one short sentence), then ask the next.
- If an answer is vague, ask at most ONE brief follow-up before moving on.
- Use the company context provided to make questions specific; never re-ask something already known.
- Keep your messages short and conversational. No bullet lists, no numbered agendas shown to the user.
- After the user has answered all four questions, call the record_bid_profile tool with their judgment captured faithfully in their own framing. Do not call the tool before all four are answered. Do not continue the conversation after calling it.`;

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
