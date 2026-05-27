import { NextResponse } from 'next/server';
import { DrizzleIngestStore, runIngest } from '@/lib/opportunities/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily opportunity ingest, triggered by Vercel Cron (see vercel.json). Vercel
// attaches `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set;
// we reject anything else so the endpoint is not publicly runnable.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runIngest({ store: new DrizzleIngestStore() });
    console.log(JSON.stringify({ level: 'info', event: 'ingest_run', ...summary }));
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', event: 'ingest_failed', error: message }));
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
