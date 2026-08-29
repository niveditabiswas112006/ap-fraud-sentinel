// GET /api/vendors?page=&limit=&search= → paginated vendor list with computed stats
// (paymentCount, amountMean, amountStd). Mirrors worker/utils/stats.py.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeStats } from '@/lib/api-helpers';
import type { VendorRecord } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VendorRow {
  vendorId: string;
  legalName: string;
  registeredDomain: string;
  knownPhone: string;
  knownBankAccount: string;
  bankAccountAddedDate: string;
  firstInvoiceDate: string;
  address: string;
  contactEmail: string;
  taxId: string;
}

interface PaymentRow {
  vendorId: string;
  amountUsd: number;
}

const MAX_LIMIT = 200;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const limitRaw = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit') ?? '60') || 60));
  const offset = (page - 1) * limitRaw;
  const search = (url.searchParams.get('search') ?? '').toString();

  // Pull all payments once and compute stats per vendor in JS (cheap; 480 rows).
  const allPayments = (await db.$queryRaw<PaymentRow[]>`
    SELECT "vendorId", "amountUsd" FROM "PaymentHistory"
  `) as PaymentRow[];
  const byVendor = new Map<string, number[]>();
  for (const p of allPayments) {
    const list = byVendor.get(p.vendorId) ?? [];
    list.push(Number(p.amountUsd));
    byVendor.set(p.vendorId, list);
  }

  // Build the filter safely via parameterized SQL through $queryRawUnsafe.
  const params: (string | number)[] = [];
  const whereParts: string[] = [];
  if (search) {
    const s = `%${search}%`;
    whereParts.push(`("legalName" LIKE ? OR "vendorId" LIKE ? OR "registeredDomain" LIKE ?)`);
    params.push(s, s, s);
  }
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const rowsSql = `SELECT * FROM "Vendor" ${whereClause} ORDER BY "vendorId" ASC LIMIT ? OFFSET ?`;
  const rows = (await db.$queryRawUnsafe<VendorRow[]>(rowsSql, ...params, limitRaw, offset)) as VendorRow[];

  const items: VendorRecord[] = rows.map((r) => {
    const amounts = byVendor.get(r.vendorId) ?? [];
    const stats = computeStats(amounts.map((a) => ({ amountUsd: a })));
    return {
      vendorId: r.vendorId,
      legalName: r.legalName,
      registeredDomain: r.registeredDomain,
      knownPhone: r.knownPhone,
      knownBankAccount: r.knownBankAccount,
      bankAccountAddedDate: r.bankAccountAddedDate,
      firstInvoiceDate: r.firstInvoiceDate,
      address: r.address,
      contactEmail: r.contactEmail,
      taxId: r.taxId,
      paymentCount: stats.count,
      amountMean: stats.mean,
      amountStd: stats.std,
    };
  });

  const totalSql = `SELECT COUNT(*) AS count FROM "Vendor" ${whereClause}`;
  const totalRow = (await db.$queryRawUnsafe<Array<{ count: number }>>(totalSql, ...params)) as Array<{ count: number }>;
  // SQLite COUNT(*) returns BigInt via Prisma raw — wrap with Number() so JSON.stringify works.
  const total = Number(totalRow.at(0)?.count ?? items.length);

  return NextResponse.json({ items, total, page, limit: limitRaw });
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const legalName = String(body.legalName ?? '').trim();
  const registeredDomain = String(body.registeredDomain ?? '').trim();
  const knownPhone = String(body.knownPhone ?? '').trim();
  const knownBankAccount = String(body.knownBankAccount ?? '').trim();
  const contactEmail = String(body.contactEmail ?? '').trim();

  if (!legalName || !registeredDomain) {
    return NextResponse.json({ error: 'legalName and registeredDomain are required' }, { status: 400 });
  }

  const existingCountRow = (await db.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*) as count FROM "Vendor"`) as Array<{ count: number }>;
  const count = Number(existingCountRow.at(0)?.count ?? 60);
  const vendorId = body.vendorId ? String(body.vendorId).trim() : `V-${1001 + count}`;
  const today = new Date().toISOString().split('T')[0];

  try {
    await db.$executeRaw`
      INSERT INTO "Vendor" (
        "vendorId", "legalName", "registeredDomain", "knownPhone",
        "knownBankAccount", "bankAccountAddedDate", "firstInvoiceDate",
        "address", "contactEmail", "taxId"
      ) VALUES (
        ${vendorId}, ${legalName}, ${registeredDomain}, ${knownPhone || '+1 (555) 000-0000'},
        ${knownBankAccount || '1234567890'}, ${today}, ${today},
        '100 Enterprise Way', ${contactEmail || `ap@${registeredDomain}`}, 'XX-XXXXXXX'
      )
    `;

    return NextResponse.json({
      ok: true,
      vendor: {
        vendorId,
        legalName,
        registeredDomain,
        knownPhone,
        knownBankAccount,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
