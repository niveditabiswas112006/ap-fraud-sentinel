// GET /api/cases — paginated, filterable case list.
// Query: ?status=&vendor_id=&runId=&page=&limit=&search=&fraud_type=
// Returns { items: CaseRecordExt[], total, page, limit } where each item is a
// CaseRecord plus parsed `evidencePack` and `facts` fields (per Task 3-a spec).
// Ordered by createdAt DESC (newest first). Parameterized via $queryRawUnsafe.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mapCase, type CaseRow } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StatsRow {
  total: bigint | number;
}

const MAX_LIMIT = 500;

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? '';
  const vendorId = url.searchParams.get('vendor_id') ?? '';
  const runId = url.searchParams.get('runId') ?? '';
  const search = url.searchParams.get('search') ?? '';
  const fraudType = url.searchParams.get('fraud_type') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const limitRaw = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? '50') || 50),
  );
  const offset = (page - 1) * limitRaw;

  // Compose a parameterized WHERE clause — bind every value, no string interpolation.
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (status) {
    where.push(`"status" = ?`);
    params.push(status);
  }
  if (vendorId) {
    where.push(`"vendorId" = ?`);
    params.push(vendorId);
  }
  if (runId) {
    where.push(`"runId" = ?`);
    params.push(runId);
  }
  if (fraudType) {
    where.push(`"fraudType" = ?`);
    params.push(fraudType);
  }
  if (search) {
    const s = `%${search}%`;
    where.push(`("caseId" LIKE ? OR "invoiceNumber" LIKE ? OR "vendorName" LIKE ?)`);
    params.push(s, s, s);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // ORDER BY createdAt DESC, caseId — newest first, deterministic tiebreak.
  const rows = (await db.$queryRawUnsafe<CaseRow[]>(`
    SELECT * FROM "Case" ${whereClause}
    ORDER BY "createdAt" DESC, "caseId" ASC
    LIMIT ? OFFSET ?
  `, ...params, limitRaw, offset)) as CaseRow[];

  const stats = (await db.$queryRawUnsafe<StatsRow[]>(`
    SELECT COUNT(*) AS total FROM "Case" ${whereClause}
  `, ...params)) as StatsRow[];
  const total = Number(stats.at(0)?.total ?? rows.length);

  const items = rows.map((r) => ({
    ...mapCase(r),
    evidencePack: safeJsonParse<Record<string, unknown>>(r.evidencePackJson, {}),
    facts: safeJsonParse<Record<string, unknown>>(r.factsJson, {}),
  }));

  return NextResponse.json({ items, total, page, limit: limitRaw });
}
