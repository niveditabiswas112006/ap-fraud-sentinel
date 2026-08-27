// Server-side helpers shared by /api/cases/* and /api/stats routes.
// Parses the JSON-string columns the worker writes and assembles CaseRecord-shaped
// objects the dashboard consumes directly. Mirrors src/lib/types.ts.

import type { CaseRecord, Signal } from '@/lib/types';

export interface CaseRow {
  caseId: string;
  runId: string | null;
  vendorId: string | null;
  vendorName: string;
  invoiceNumber: string;
  sourcePath: string;
  kind: string;
  status: string;
  amountUsd: number;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  senderDomain: string | null;
  bankChangeRequestDate: string | null;
  requestedBankAccount: string | null;
  emailBody: string | null;
  factsJson: string;
  signalsJson: string;
  riskScore: number;
  recommendation: string | null;
  evidencePackJson: string;
  narrative: string | null;
  callTranscript: string | null;
  callAudioUrl: string | null;
  verificationResult: string | null;
  decision: string | null;
  approver: string | null;
  decisionReason: string | null;
  decisionAt: string | null;
  fraudType: string | null;
  isFraud: number | boolean | null;
  createdAt: string;
  updatedAt: string;
}

function safeParseSignals(json: string | null | undefined): Signal[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is Signal =>
      s && typeof s === 'object' && typeof s.name === 'string' && typeof s.fired === 'boolean',
    );
  } catch {
    return [];
  }
}

function asBool(v: number | boolean | null | undefined): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return Boolean(v);
}

/** Map a raw DB row (camelCase columns from the worker) to a CaseRecord. */
export function mapCase(row: CaseRow): CaseRecord {
  return {
    caseId: row.caseId,
    runId: row.runId ?? undefined,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    invoiceNumber: row.invoiceNumber,
    sourcePath: row.sourcePath,
    kind: row.kind === 'email' ? 'email' : 'invoice',
    status: row.status as CaseRecord['status'],
    amountUsd: Number(row.amountUsd ?? 0),
    currency: row.currency ?? 'USD',
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    senderDomain: row.senderDomain,
    bankChangeRequestDate: row.bankChangeRequestDate,
    requestedBankAccount: row.requestedBankAccount,
    emailBody: row.emailBody,
    factsJson: row.factsJson ?? '',
    signals: safeParseSignals(row.signalsJson),
    riskScore: Number(row.riskScore ?? 0),
    recommendation: (row.recommendation as CaseRecord['recommendation']) ?? null,
    evidencePackJson: row.evidencePackJson ?? '',
    narrative: row.narrative,
    callTranscript: row.callTranscript,
    callAudioUrl: row.callAudioUrl,
    verificationResult: (row.verificationResult as CaseRecord['verificationResult']) ?? null,
    decision: (row.decision as CaseRecord['decision']) ?? null,
    approver: row.approver,
    decisionReason: row.decisionReason,
    decisionAt: row.decisionAt,
    fraudType: row.fraudType,
    isFraud: asBool(row.isFraud),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3030';

/** Proxy to the Python worker (server-to-server, no browser-gateway rule). */
export async function workerFetch(pathname: string, init?: RequestInit): Promise<Response> {
  const url = `${WORKER_URL}${pathname}`;
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/** Compute amount mean & sample std for a vendor from raw payment rows. Mirrors worker/utils/stats.py. */
export function computeStats(
  payments: { amountUsd: number }[],
): { count: number; mean: number; std: number } {
  const n = payments.length;
  if (n === 0) return { count: 0, mean: 0, std: 0 };
  const mean = payments.reduce((s, p) => s + Number(p.amountUsd), 0) / n;
  const variance =
    n > 1
      ? payments.reduce((s, p) => s + (Number(p.amountUsd) - mean) ** 2, 0) / (n - 1)
      : 0;
  return { count: n, mean, std: Math.sqrt(variance) };
}
