// GET /api/ground-truth → the 10 fraud_ground_truth rows + detector scorecard.
// Score is computed live by joining against the Case table (recommendation, isFraud).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GroundTruthRow {
  id: number;
  caseId: string;
  invoiceNumber: string;
  fraudType: string;
  isFraud: number;
  expectedSignal: string;
}

interface DetectorRow {
  caseId: string;
  invoiceNumber: string;
  recommendation: string | null;
  isFraud: number | boolean | null;
  fraudType: string | null;
  status: string;
}

export async function GET() {
  const truth = (await db.$queryRaw<GroundTruthRow[]>`
    SELECT "id", "caseId", "invoiceNumber", "fraudType", "isFraud", "expectedSignal"
    FROM "FraudGroundTruth" ORDER BY "id" ASC
  `) as GroundTruthRow[];

  // Pull the matching detector rows.
  const caseIds = truth.map((t) => t.caseId);
  let detector: DetectorRow[] = [];
  if (caseIds.length > 0) {
    // SQLite `IN (...)` via $queryRawUnsafe — bind each caseId.
    const placeholders = caseIds.map(() => '?').join(',');
    detector = (await db.$queryRawUnsafe<DetectorRow[]>(
      `SELECT "caseId", "invoiceNumber", "recommendation", "isFraud", "fraudType", "status"
       FROM "Case" WHERE "caseId" IN (${placeholders})`,
      ...caseIds,
    )) as DetectorRow[];
  }
  const byCase = new Map(detector.map((d) => [d.caseId, d]));

  let truePositives = 0;
  let falseNegatives = 0;
  let falsePositives = 0;
  let pending = 0;
  const scored = truth.map((t) => {
    const d = byCase.get(t.caseId);
    const isFraudTruth = Boolean(t.isFraud);
    const held = d?.recommendation === 'hold';
    if (!d) {
      pending += 1;
    } else if (isFraudTruth && held) {
      truePositives += 1;
    } else if (isFraudTruth && !held) {
      falseNegatives += 1;
    } else if (!isFraudTruth && held) {
      falsePositives += 1;
    }
    return {
      // Wrap id with Number() — Prisma $queryRaw returns SQLite INTEGER as
      // BigInt for safety; JSON.stringify can't serialize BigInt and would
      // crash the response.
      id: Number(t.id),
      caseId: t.caseId,
      invoiceNumber: t.invoiceNumber,
      fraudType: t.fraudType,
      isFraud: isFraudTruth,
      expectedSignal: t.expectedSignal,
      detectorRecommendation: d?.recommendation ?? null,
      detectorStatus: d?.status ?? null,
      detectorFraudType: d?.fraudType ?? null,
      caught: Boolean(isFraudTruth && held),
      missed: Boolean(isFraudTruth && !held),
    };
  });

  return NextResponse.json({
    items: scored,
    total: truth.length,
    score: {
      truePositives,
      falseNegatives,
      falsePositives,
      pending,
      precision: truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0,
      recall: truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0,
    },
  });
}
