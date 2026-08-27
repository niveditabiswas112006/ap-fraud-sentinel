// GET  /api/runs           → list all runs (DESC by startedAt) with their cost breakdown.
// POST /api/runs           → generate a run_id (run-<timestamp>), POST to worker, return {run_id,status}.

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

export async function GET() {
  const rows = (await db.$queryRaw<RunRow[]>`
    SELECT * FROM "Run" ORDER BY "startedAt" DESC
  `) as RunRow[];
  const items: RunRecord[] = rows.map((r) => ({
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
  }));
  return NextResponse.json({ items, total: items.length });
}

interface PostBody {
  run_id?: string;
  batch_path?: string;
  limit?: number;
}

export async function POST(req: Request) {
  let body: PostBody = {};
  try {
    body = (await req.json().catch(() => ({}))) as PostBody;
  } catch {
    /* empty body is allowed — generate run_id */
  }
  const runId =
    (body.run_id ?? '').toString().trim() ||
    `run-${Date.now()}-${Math.floor(Math.random() * 1e4).toString(36).padStart(3, '0')}`;

  const payload: Record<string, unknown> = { run_id: runId };
  if (body.batch_path) payload.batch_path = body.batch_path;
  if (typeof body.limit === 'number') payload.limit = body.limit;

  const r = await workerFetch('/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    return NextResponse.json({ error: `worker /runs failed: ${r.status} ${txt}` }, { status: 502 });
  }
  const json = (await r.json().catch(() => ({}))) as { run_id?: string; status?: string };
  return NextResponse.json({ run_id: json.run_id ?? runId, status: json.status ?? 'running' });
}
