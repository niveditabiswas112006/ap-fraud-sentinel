// GET /api/healthz — worker + ws channel health.
// Server-side fetches to the Python worker (3030) and the WS mini-service (3003).
// Always returns 200; if a service is down, that service's payload carries {ok:false,error}.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3030';
const WS_URL = process.env.WS_URL ?? 'http://localhost:3003';

interface ServiceHealth {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

async function fetchJson(url: string, timeoutMs = 2000): Promise<ServiceHealth> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) return { ok: false, error: `http ${r.status}` };
    const json = (await r.json()) as Record<string, unknown>;
    return { ok: Boolean(json.ok ?? true), ...json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const [worker, ws] = await Promise.all([
    fetchJson(`${WORKER_URL}/healthz`),
    fetchJson(`${WS_URL}/healthz`),
  ]);
  return NextResponse.json(
    {
      ok: worker.ok && ws.ok,
      worker,
      ws,
    },
    { status: 200 },
  );
}
