// GET /api/stats — aggregate stats for the dashboard home view.
// Per spec:
//   casesScreened = COUNT(*) FROM "Case"
//   casesHeld     = COUNT(*) WHERE recommendation='hold'
//   fraudCaught   = COUNT(*) WHERE recommendation='hold' AND isFraud=1
//   amountSavedUsd= SUM(amountUsd) WHERE recommendation='hold' AND isFraud=1
//   lastRunId/lastRunStatus = newest Run row by startedAt
// Computed from the SQLite DB directly (server-side). "Case" is quoted because
// CASE is a SQL keyword.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AggRow {
  total: bigint | number;
  held: bigint | number;
  fraud: bigint | number;
  saved: number | bigint;
}

interface LastRunRow {
  runId: string;
  status: string;
}

export async function GET() {
  const agg =
    (await db.$queryRaw<AggRow[]>`
      SELECT
        COUNT(*)                                                        AS total,
        COUNT(*) FILTER (WHERE "recommendation" = 'hold')               AS held,
        COUNT(*) FILTER (WHERE "isFraud" = 1 AND "recommendation" = 'hold') AS fraud,
        COALESCE(SUM("amountUsd") FILTER (WHERE "isFraud" = 1 AND "recommendation" = 'hold'), 0) AS saved
      FROM "Case"
    `).at(0) ?? { total: 0, held: 0, fraud: 0, saved: 0 };

  const lastRun =
    (await db.$queryRaw<LastRunRow[]>`
      SELECT "runId", "status" FROM "Run" ORDER BY "startedAt" DESC LIMIT 1
    `).at(0) ?? null;

  const runsAgg =
    (await db.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*) AS count FROM "Run"
    `).at(0) ?? { count: 0 };

  return NextResponse.json({
    casesScreened: Number(agg.total ?? 0),
    casesHeld: Number(agg.held ?? 0),
    fraudCaught: Number(agg.fraud ?? 0),
    amountSavedUsd: Number(agg.saved ?? 0),
    lastRunId: lastRun?.runId ?? null,
    lastRunStatus: lastRun?.status ?? null,
    runsTotal: Number(runsAgg.count ?? 0),
  });
}
