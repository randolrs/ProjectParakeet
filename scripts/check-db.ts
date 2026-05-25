import 'dotenv/config';
import postgres from 'postgres';

// Confirms DATABASE_URL connects to the hosted Supabase Postgres. Used as the
// M0 acceptance check. Run: npx tsx scripts/check-db.ts
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 1 });
  try {
    const rows = await sql`select version() as version, current_database() as db`;
    console.log('DB connection OK:', rows[0]);
  } catch (err) {
    console.error('DB connection FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
