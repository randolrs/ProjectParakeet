'use server';

import type Anthropic from '@anthropic-ai/sdk';
import { redirect } from 'next/navigation';
import { anthropic, MODELS, withClaudeLogging } from '@/lib/llm/client';
import {
  ONBOARDING_CONVERSATION_PROMPT,
  buildConversationContext,
} from '@/lib/llm/prompts/federal/onboarding-conversation';
import { BID_PROFILE_TOOL, BidProfileSchema } from '@/lib/onboarding/bid-profile';
import { ExtractedCompanySchema } from '@/lib/onboarding/enrichment';
import { createClient } from '@/lib/supabase/server';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type TurnResult = { type: 'message'; content: string } | { type: 'complete' };

// Primer (4 questions) + their answers. Past this, force the closing tool call
// so the interview can't run forever.
const MAX_USER_TURNS_BEFORE_FORCE = 5;

export async function conversationTurn(history: ChatMessage[]): Promise<TurnResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: prefs }, { data: enr }] = await Promise.all([
    supabase.from('company_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('company_enrichment').select('extracted').eq('user_id', user.id).maybeSingle(),
  ]);

  const extracted = ExtractedCompanySchema.partial().safeParse(enr?.extracted);
  const extractedData = extracted.success ? extracted.data : undefined;

  const system = `${ONBOARDING_CONVERSATION_PROMPT}\n\n${buildConversationContext(prefs, extractedData)}`;
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const userTurns = history.filter((m) => m.role === 'user').length;
  const forceTool = userTurns >= MAX_USER_TURNS_BEFORE_FORCE;

  const res = await withClaudeLogging({ op: 'onboarding_conversation', userTurns }, () =>
    anthropic().messages.create({
      model: MODELS.onboarding,
      max_tokens: 1024,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [BID_PROFILE_TOOL],
      tool_choice: forceTool
        ? { type: 'tool', name: BID_PROFILE_TOOL.name }
        : { type: 'auto' },
      messages,
    }),
  );

  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (toolUse) {
    const parsed = BidProfileSchema.safeParse(toolUse.input);
    if (parsed.success) {
      const { error } = await supabase.from('bid_profile').upsert(
        {
          user_id: user.id,
          walk_away_signals: parsed.data.walkAwaySignals,
          incumbent_displacement_appetite: parsed.data.incumbentDisplacementAppetite,
          teaming_posture: parsed.data.teamingPosture,
          response_effort_tolerance: parsed.data.responseEffortTolerance,
          capability_summary: extractedData?.capabilitySummary ?? null,
          differentiators: extractedData?.differentiators ?? [],
          raw_conversation_log: history,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw new Error(error.message);
      return { type: 'complete' };
    }
  }

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { type: 'message', content: text || 'Could you say a little more about that?' };
}
