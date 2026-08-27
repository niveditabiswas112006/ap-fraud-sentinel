// GET    /api/cases/[id]   → full CaseRecord + parsed evidencePack/facts + vendor + decisions + paymentHistory.
// PATCH  /api/cases/[id]   → POST /decisions to the worker (case_id, approver, decision, reason).
//                            If the worker is down, write the Decision directly to the DB as a fallback:
//                            insert Decision row + update Case.decision/decisionReason/decisionAt/approver/status='closed'.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mapCase, workerFetch, type CaseRow } from '@/lib/api-helpers';
import type { ControllerDecision, DecisionRecord, PaymentRecord } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface DecisionRow {
  id: number;
  caseId: string;
  approver: string;
  decision: string;
  reason: string;
  timestamp: string;
}

interface PaymentRow {
  paymentId: string;
  vendorId: string;
  invoiceNumber: string;
  paidDate: string;
  amountUsd: number;
  currencyOriginal: string;
}

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const rows = (await db.$queryRaw<CaseRow[]>`
    SELECT * FROM "Case" WHERE "caseId" = ${id}
  `) as CaseRow[];
  const row = rows.at(0);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Decision history (audit trail) — ordered oldest first.
  const decisions = (await db.$queryRaw<DecisionRow[]>`
    SELECT "id", "caseId", "approver", "decision", "reason", "timestamp"
    FROM "Decision" WHERE "caseId" = ${id}
    ORDER BY "timestamp" ASC
  `) as DecisionRow[];

  // Vendor enrichment + payment history (sparkline) — only if the case grounded.
  let vendor: Record<string, unknown> | null = null;
  let paymentHistory: PaymentRecord[] = [];
  if (row.vendorId) {
    const v = (await db.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "Vendor" WHERE "vendorId" = ${row.vendorId}
    `) as Record<string, unknown>[];
    vendor = v.at(0) ?? null;

    const payments = (await db.$queryRaw<PaymentRow[]>`
      SELECT "paymentId", "vendorId", "invoiceNumber", "paidDate", "amountUsd", "currencyOriginal"
      FROM "PaymentHistory" WHERE "vendorId" = ${row.vendorId}
      ORDER BY "paidDate" DESC LIMIT 50
    `) as PaymentRow[];
    paymentHistory = payments.map((p) => ({
      paymentId: p.paymentId,
      vendorId: p.vendorId,
      invoiceNumber: p.invoiceNumber,
      paidDate: p.paidDate,
      amountUsd: Number(p.amountUsd),
      currencyOriginal: p.currencyOriginal,
    }));
  }

  const caseRec = mapCase(row);

  // Resolve call audio url — the TTS route persists /public/calls/{caseId}.wav.
  const audioUrl = caseRec.callAudioUrl
    ? caseRec.callAudioUrl
    : `/calls/${encodeURIComponent(row.caseId)}.wav`;

  return NextResponse.json({
    ...caseRec,
    callAudioUrl: audioUrl,
    evidencePack: safeJsonParse<Record<string, unknown>>(row.evidencePackJson, {}),
    facts: safeJsonParse<Record<string, unknown>>(row.factsJson, {}),
    vendor,
    paymentHistory,
    decisions: decisions.map((d) => ({
      id: d.id,
      caseId: d.caseId,
      approver: d.approver,
      decision: d.decision as ControllerDecision,
      reason: d.reason,
      timestamp: d.timestamp,
    })) as DecisionRecord[],
  });
}

interface PatchBody {
  decision?: string;
  approver?: string;
  reason?: string;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const decision = (body.decision ?? '').toString();
  const approver = (body.approver ?? '').toString().trim();
  const reason = (body.reason ?? '').toString().trim();
  if (!['release', 'hold', 'escalate'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be release|hold|escalate' }, { status: 400 });
  }
  if (!approver || !reason) {
    return NextResponse.json({ error: 'approver and reason required' }, { status: 400 });
  }

  // Server-to-server call to the worker — no browser-gateway rule.
  let workerOk = false;
  try {
    const r = await workerFetch('/decisions', {
      method: 'POST',
      body: JSON.stringify({ case_id: id, approver, decision, reason }),
    });
    if (r.ok) {
      workerOk = true;
      const json = (await r.json().catch(() => ({}))) as { status?: string; decision?: string };
      return NextResponse.json({ ok: true, caseId: id, ...json });
    }
    // Worker rejected (4xx) — surface the error to the caller; do NOT silently fallback.
    const txt = await r.text().catch(() => '');
    return NextResponse.json(
      { error: `worker rejected decision: ${r.status} ${txt}` },
      { status: 502 },
    );
  } catch (e) {
    // Worker is unreachable — fall back to writing the Decision directly to the DB
    // so the controller's action still lands even with the worker offline.
    console.warn(
      '[/api/cases PATCH] worker unreachable, writing decision to DB directly:',
      e instanceof Error ? e.message : String(e),
    );
  }

  if (workerOk) {
    // unreachable — kept for TS exhaustiveness
    return NextResponse.json({ ok: true, caseId: id, fallback: false });
  }

  // --- DB FALLBACK (worker offline) ---------------------------------------
  try {
    const existing = (await db.$queryRaw<Array<{ caseId: string }>>`
      SELECT "caseId" FROM "Case" WHERE "caseId" = ${id}
    `) as Array<{ caseId: string }>;
    if (existing.length === 0) {
      return NextResponse.json({ error: 'case not found' }, { status: 404 });
    }

    await db.$executeRaw`
      INSERT INTO "Decision" ("caseId", "approver", "decision", "reason", "timestamp")
      VALUES (${id}, ${approver}, ${decision}, ${reason}, datetime('now'))
    `;
    await db.$executeRaw`
      UPDATE "Case"
      SET "decision" = ${decision},
          "approver" = ${approver},
          "decisionReason" = ${reason},
          "decisionAt" = datetime('now'),
          "status" = 'closed',
          "updatedAt" = datetime('now')
      WHERE "caseId" = ${id}
    `;
    return NextResponse.json({
      ok: true,
      caseId: id,
      decision,
      approver,
      status: 'closed',
      fallback: 'db',
    });
  } catch (e) {
    return NextResponse.json(
      { error: `db fallback failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
