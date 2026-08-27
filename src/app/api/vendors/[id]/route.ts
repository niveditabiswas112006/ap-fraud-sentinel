// GET /api/vendors/[id] → vendor detail + payment history (sparkline data).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeStats } from '@/lib/api-helpers';
import type { PaymentRecord, VendorRecord } from '@/lib/types';

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
  paymentId: string;
  vendorId: string;
  invoiceNumber: string;
  paidDate: string;
  amountUsd: number;
  currencyOriginal: string;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const vendors = (await db.$queryRaw<VendorRow[]>`
    SELECT * FROM "Vendor" WHERE "vendorId" = ${id}
  `) as VendorRow[];
  const row = vendors.at(0);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const payments = (await db.$queryRaw<PaymentRow[]>`
    SELECT "paymentId", "vendorId", "invoiceNumber", "paidDate", "amountUsd", "currencyOriginal"
    FROM "PaymentHistory" WHERE "vendorId" = ${id}
    ORDER BY "paidDate" ASC
  `) as PaymentRow[];

  const stats = computeStats(payments.map((p) => ({ amountUsd: Number(p.amountUsd) })));

  const vendor: VendorRecord = {
    vendorId: row.vendorId,
    legalName: row.legalName,
    registeredDomain: row.registeredDomain,
    knownPhone: row.knownPhone,
    knownBankAccount: row.knownBankAccount,
    bankAccountAddedDate: row.bankAccountAddedDate,
    firstInvoiceDate: row.firstInvoiceDate,
    address: row.address,
    contactEmail: row.contactEmail,
    taxId: row.taxId,
    paymentCount: stats.count,
    amountMean: stats.mean,
    amountStd: stats.std,
  };

  const paymentRecords: PaymentRecord[] = payments.map((p) => ({
    paymentId: p.paymentId,
    vendorId: p.vendorId,
    invoiceNumber: p.invoiceNumber,
    paidDate: p.paidDate,
    amountUsd: Number(p.amountUsd),
    currencyOriginal: p.currencyOriginal,
  }));

  return NextResponse.json({ vendor, payments: paymentRecords, stats });
}
