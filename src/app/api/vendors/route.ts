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

import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const vendorsList: Array<{
    vendorId?: string;
    legalName: string;
    registeredDomain: string;
    knownPhone?: string;
    knownBankAccount?: string;
    contactEmail?: string;
    address?: string;
    taxId?: string;
  }> = Array.isArray(body) ? body : Array.isArray(body.vendors) ? body.vendors : [body];

  if (!vendorsList.length) {
    return NextResponse.json({ error: 'no vendor data provided' }, { status: 400 });
  }

  const existingCountRow = (await db.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*) as count FROM "Vendor"`) as Array<{ count: number }>;
  let currentCount = Number(existingCountRow.at(0)?.count ?? 60);
  const today = new Date().toISOString().split('T')[0];

  const addedVendors: any[] = [];
  const csvRowsToAppend: string[] = [];

  for (const item of vendorsList) {
    const legalName = String(item.legalName ?? '').trim();
    const registeredDomain = String(item.registeredDomain ?? '').trim();
    const knownPhone = String(item.knownPhone ?? '').trim();
    const knownBankAccount = String(item.knownBankAccount ?? '').trim();
    const contactEmail = String(item.contactEmail ?? '').trim();
    const address = String(item.address ?? '100 Enterprise Way').trim();
    const taxId = String(item.taxId ?? 'XX-XXXXXXX').trim();

    if (!legalName || !registeredDomain) continue;

    currentCount += 1;
    const vendorId = item.vendorId ? String(item.vendorId).trim() : `V-${1000 + currentCount}`;

    try {
      await db.$executeRaw`
        INSERT OR REPLACE INTO "Vendor" (
          "vendorId", "legalName", "registeredDomain", "knownPhone",
          "knownBankAccount", "bankAccountAddedDate", "firstInvoiceDate",
          "address", "contactEmail", "taxId"
        ) VALUES (
          ${vendorId}, ${legalName}, ${registeredDomain}, ${knownPhone || '+1 (555) 000-0000'},
          ${knownBankAccount || '1234567890'}, ${today}, ${today},
          ${address}, ${contactEmail || `ap@${registeredDomain}`}, ${taxId}
        )
      `;

      addedVendors.push({ vendorId, legalName, registeredDomain, knownPhone, knownBankAccount });
      csvRowsToAppend.push(`${vendorId},"${legalName}",${registeredDomain},${knownPhone || '+1 (555) 000-0000'},${knownBankAccount || '1234567890'},${today},${today},"${address}",${contactEmail || `ap@${registeredDomain}`},${taxId}`);
    } catch {
      // Ignore individual row duplicate conflicts
    }
  }

  // Update data/vendor_master.csv on disk if new vendors were added
  if (csvRowsToAppend.length > 0) {
    try {
      const csvPath = path.join(process.cwd(), 'data', 'vendor_master.csv');
      const existingCsv = await readFile(csvPath, 'utf8').catch(() => '');
      if (existingCsv) {
        const updatedCsv = existingCsv.trim() + '\n' + csvRowsToAppend.join('\n') + '\n';
        await writeFile(csvPath, updatedCsv, 'utf8');
      }
    } catch {
      /* ignore file write error */
    }
  }

  return NextResponse.json({
    ok: true,
    count: addedVendors.length,
    vendors: addedVendors,
  });
}
