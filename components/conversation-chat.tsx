'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { conversationTurn, type ChatMessage } from '@/app/onboarding/conversation/actions';

export function ConversationChat({
  initialMessage,
  initialSuggestions,
}: {
  initialMessage: string;
  initialSuggestions: string[];
}) {
  const router = useRouter();
  // Seeded with the first question so the page is never blank / round-tripping.
  const [history, setHistory] = useState<ChatMessage[]>([
    { role: 'assistant', content: initialMessage },
  ]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(initialSuggestions);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function advance(next: ChatMessage[]) {
    setHistory(next);
    setError(null);
    setSuggestions([]);
    setPending(true);
    try {
      const res = await conversationTurn(next);
      if (res.type === 'complete') {
        router.push('/dashboard');
        return;
      }
      setHistory([...next, { role: 'assistant', content: res.content }]);
      setSuggestions(res.suggestions);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setInput('');
    void advance([...history, { role: 'user', content: trimmed }]);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, pending]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">A few questions</h1>
        <p className="text-sm text-zinc-500">
          This captures how you decide what to bid — four short questions.
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-3 pb-4">
        {history.map((m, i) => (
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
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-400 dark:bg-zinc-800">
              …
            </div>
          </div>
        )}
        {!pending && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form
        onSubmit={onSubmit}
        className="sticky bottom-0 flex gap-2 bg-white py-3 dark:bg-zinc-950"
      >
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
