import { NextResponse } from 'next/server';
import { findUsersDueForDigest, generateDigest } from '@/lib/digest/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Hourly digest cron. For each user whose digest_delivery_hour matches the
// current UTC hour AND who has no successful digest yet today, run the
// full pipeline (filter → describe → score → synthesize → render → send).
// One user per request keeps us inside the 60s function timeout; the cron
// fires every hour, so a backlog of users at the same hour catches up over
// the next few minutes.
//
// Bearer ${CRON_SECRET} guard same as /api/cron/ingest.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let userIds: string[];
  try {
    userIds = await findUsersDueForDigest(now);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ level: 'error', event: 'digest_cron_due_query_failed', error: message }),
    );
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const results: { userId: string; ok: boolean; error?: string }[] = [];
  for (const userId of userIds) {
    try {
      const summary = await generateDigest({ userId, now });
      console.log(
        JSON.stringify({ level: 'info', event: 'digest_run_cron', ...summary }),
      );
      results.push({ userId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'digest_failed_cron',
          userId,
          error: message,
        }),
      );
      results.push({ userId, ok: false, error: message });
    }
  }

  return NextResponse.json({ ok: true, hour: now.getUTCHours(), dueCount: userIds.length, results });
}
