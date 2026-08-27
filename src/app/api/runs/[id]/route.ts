// GET /api/runs/[id] → proxy to worker /runs/{id}; if worker is down, read the Run row from DB.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workerFetch } from '@/lib/api-helpers';
import type { RunRecord } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RunRow {
  runId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  casesProcessed: number;
  casesHeld: number;
  fraudCaught: number;
  amountSavedUsd: number;
  signalsCostUsd: number;
  llmCostUsd: number;
  callCostUsd: number;
  totalUsd: number;
  durationS: number;
}

function runRowToRecord(r: RunRow): RunRecord {
  return {
    runId: r.runId,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    status: (r.status as RunRecord['status']) ?? 'running',
    casesProcessed: Number(r.casesProcessed ?? 0),
    casesHeld: Number(r.casesHeld ?? 0),
    fraudCaught: Number(r.fraudCaught ?? 0),
    amountSavedUsd: Number(r.amountSavedUsd ?? 0),
    signalsCostUsd: Number(r.signalsCostUsd ?? 0),
    llmCostUsd: Number(r.llmCostUsd ?? 0),
    callCostUsd: Number(r.callCostUsd ?? 0),
    totalUsd: Number(r.totalUsd ?? 0),
    durationS: Number(r.durationS ?? 0),
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // 1. Try the worker first.
  try {
    const r = await workerFetch(`/runs/${encodeURIComponent(id)}`);
    if (r.ok) {
      const json = await r.json().catch(() => null);
      if (json && typeof json === 'object' && ('runId' in json || 'run_id' in json)) {
        return NextResponse.json(json);
      }
    }
    // Worker responded with non-OK or empty body — fall through to DB.
  } catch (e) {
    // Worker unreachable — fall through to DB.
    console.warn(
      '[/api/runs/[id]] worker unreachable, falling back to DB:',
      e instanceof Error ? e.message : String(e),
    );
  }

  // 2. DB fallback.
  const rows = (await db.$queryRaw<RunRow[]>`
    SELECT * FROM "Run" WHERE "runId" = ${id}
  `) as RunRow[];
  const row = rows.at(0);
  if (!row) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  return NextResponse.json(runRowToRecord(row));
}
