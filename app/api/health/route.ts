import { NextResponse } from 'next/server';
import { client } from '@/lib/db';

// TEMPORARY M0 diagnostic: validates that DATABASE_URL connects from the
// deployed runtime via the same pooled client the app uses. Remove after
// the connection is confirmed.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await client`select version() as version, current_database() as db`;
    return NextResponse.json({ ok: true, ...rows[0] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
