'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { conversationTurn, type ChatMessage } from '@/app/onboarding/conversation/actions';

// Internal kickoff message; hidden from the rendered transcript.
const PRIMER = 'Begin the interview.';

export function ConversationChat() {
  const router = useRouter();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function advance(next: ChatMessage[]) {
    setHistory(next);
    setError(null);
    setPending(true);
    try {
      const res = await conversationTurn(next);
      if (res.type === 'complete') {
        router.push('/dashboard');
        return;
      }
      setHistory([...next, { role: 'assistant', content: res.content }]);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void advance([{ role: 'user', content: PRIMER }]);
    // advance is stable for the initial kickoff; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, pending]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    void advance([...history, { role: 'user', content: text }]);
  }

  const visible = history.slice(1); // hide the primer

  return (
    <main className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-2xl flex-col gap-4 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">A few questions</h1>
        <p className="text-sm text-zinc-500">
          This captures how you decide what to bid — four short questions.
        </p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {visible.map((m, i) => (
          <div key={i} className={m.role === 'assistant' ? 'flex justify-start' : 'flex justify-end'}>
            <div
              className={
                m.role === 'assistant'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-100 px-4 py-2 text-sm dark:bg-zinc-800'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-zinc-900'
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && <div className="text-sm text-zinc-400">…</div>}
        <div ref={endRef} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
          placeholder="Type your answer…"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          Send
        </button>
      </form>
    </main>
  );
}
