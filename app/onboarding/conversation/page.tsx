import { redirect } from 'next/navigation';
import { ConversationChat } from '@/components/conversation-chat';
import { FIRST_QUESTION } from '@/lib/llm/prompts/federal/onboarding-conversation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ConversationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <ConversationChat
      initialMessage={FIRST_QUESTION.message}
      initialSuggestions={FIRST_QUESTION.suggestions}
    />
  );
}
