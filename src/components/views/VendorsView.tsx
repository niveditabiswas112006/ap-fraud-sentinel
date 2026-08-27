'use client';

// VendorsView — read-only table of all 60 vendors with payment stats. Clicking a row
// opens a modal with the vendor's payment-history sparkline (recharts).

import { useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Building2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useVendors, useVendor } from '@/hooks/useDashboardData';
import { cn } from '@/lib/utils';
import type { VendorRecord } from '@/lib/types';

function maskedBank(acct?: string) {
  if (!acct) return '—';
  if (acct.length <= 4) return acct.replace(/./g, '•');
  return `${acct.slice(0, 4)}••••${acct.slice(-4)}`;
}

export function VendorsView() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useVendors(1, 100, search);
  const { data: vendorDetail } = useVendor(selected);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#7fb8d6]" />
              Vendors ({data?.total ?? 0})
            </span>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search vendors…"
                className="h-8 w-56 pl-7 text-xs"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase">ID</TableHead>
                  <TableHead className="text-[11px] uppercase">Legal name</TableHead>
                  <TableHead className="text-[11px] uppercase">Domain</TableHead>
                  <TableHead className="text-[11px] uppercase">Bank (mask)</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">Payments</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">Mean $</TableHead>
                  <TableHead className="text-[11px] uppercase text-right">Std $</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="p-0"><Skeleton className="h-12 w-full rounded-none" /></TableCell></TableRow>
                ) : (data?.items ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No vendors.</TableCell></TableRow>
                ) : (
                  (data?.items ?? []).map((v: VendorRecord) => (
                    <TableRow
                      key={v.vendorId}
                      onClick={() => setSelected(v.vendorId)}
                      className="cursor-pointer hover:bg-muted/30"
                    >
                      <TableCell><code className="font-mono text-xs">{v.vendorId}</code></TableCell>
                      <TableCell className="text-xs">{v.legalName}</TableCell>
                      <TableCell><code className="font-mono text-[11px] text-muted-foreground">{v.registeredDomain}</code></TableCell>
                      <TableCell><code className="font-mono text-[11px]">{maskedBank(v.knownBankAccount)}</code></TableCell>
                      <TableCell className="text-right font-mono text-xs">{v.paymentCount ?? 0}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{(v.amountMean ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{(v.amountStd ?? 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-[#1f6c92]" />
              {vendorDetail?.vendor.legalName ?? selected}
            </DialogTitle>
            <DialogDescription className="text-xs">
              <code className="font-mono">{vendorDetail?.vendor.vendorId ?? selected}</code> ·{' '}
              <code className="font-mono">{vendorDetail?.vendor.registeredDomain}</code>
            </DialogDescription>
          </DialogHeader>
          {vendorDetail && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div>
                  <div className="text-muted-foreground">Phone</div>
                  <code className="font-mono">{vendorDetail.vendor.knownPhone}</code>
                </div>
                <div>
                  <div className="text-muted-foreground">Bank (known)</div>
                  <code className="font-mono">{maskedBank(vendorDetail.vendor.knownBankAccount)}</code>
                </div>
                <div>
                  <div className="text-muted-foreground">Bank added</div>
                  <code className="font-mono">{vendorDetail.vendor.bankAccountAddedDate}</code>
                </div>
                <div>
                  <div className="text-muted-foreground">First invoice</div>
                  <code className="font-mono">{vendorDetail.vendor.firstInvoiceDate}</code>
                </div>
                <div>
                  <div className="text-muted-foreground">Payments</div>
                  <code className="font-mono">{vendorDetail.vendor.paymentCount ?? 0}</code>
                </div>
                <div>
                  <div className="text-muted-foreground">Amount μ / σ</div>
                  <code className="font-mono">
                    {(vendorDetail.vendor.amountMean ?? 0).toFixed(2)} / {(vendorDetail.vendor.amountStd ?? 0).toFixed(2)}
                  </code>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Payment history sparkline
                </div>
                <div className="h-44 w-full rounded-md border border-border/60 bg-card/40 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={vendorDetail.payments.map((p) => ({ date: p.paidDate, amount: Number(p.amountUsd) }))}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: '#1f2937' }}
                      />
                      <YAxis
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={(v) => `$${v}`}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(15, 23, 42, 0.95)',
                          border: '1px solid #1f2937',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#e2e8f0',
                        }}
                        formatter={(v: number) => [`$${v.toFixed(2)}`, 'amount']}
                      />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        stroke="#1f6c92"
                        strokeWidth={2}
                        dot={{ fill: '#1f6c92', r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-border/60">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase">Payment</TableHead>
                      <TableHead className="text-[11px] uppercase">Invoice</TableHead>
                      <TableHead className="text-[11px] uppercase">Date</TableHead>
                      <TableHead className="text-[11px] uppercase text-right">Amount</TableHead>
                      <TableHead className="text-[11px] uppercase">Cur</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorDetail.payments.slice().reverse().slice(0, 12).map((p) => (
                      <TableRow key={p.paymentId}>
                        <TableCell><code className="font-mono text-xs">{p.paymentId}</code></TableCell>
                        <TableCell><code className="font-mono text-[11px] text-muted-foreground">{p.invoiceNumber}</code></TableCell>
                        <TableCell><code className="font-mono text-[11px]">{p.paidDate}</code></TableCell>
                        <TableCell className="text-right font-mono text-xs">${Number(p.amountUsd).toFixed(2)}</TableCell>
                        <TableCell className="text-xs">{p.currencyOriginal}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
