'use client';

// CasesView — filterable, sortable table of all cases (uses @tanstack/react-table).
// Filters: status, fraud_type, search. Export CSV from the filtered set.

import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { Download, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useCases } from '@/hooks/useDashboardData';
import { useAppStore } from '@/lib/store';
import { RiskGauge } from '@/components/dashboard/RiskGauge';
import { StatusBadge, RecommendationBadge, DecisionBadge } from '@/components/dashboard/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import type { CaseRecord } from '@/lib/types';

const columnHelper = createColumnHelper<CaseRecord>();

const STATUS_OPTIONS = ['', 'queued', 'extracted', 'grounded', 'scored', 'reviewed', 'verified', 'closed', 'quarantined'];
const FRAUD_OPTIONS = ['', 'BEC', 'fake_invoice', 'invoice_manipulation', 'account_takeover', 'malformed_id', 'malformed_input'];

export function CasesView() {
  const [status, setStatus] = useState('');
  const [fraudType, setFraudType] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'riskScore', desc: true }]);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, isLoading, isFetching } = useCases({
    status: status || undefined,
    fraud_type: fraudType || undefined,
    search: search || undefined,
    limit: 500,
  });

  const selectCase = useAppStore((s) => s.selectCase);

  const columns = useMemo(
    () => [
      columnHelper.accessor('caseId', {
        header: 'Case',
        cell: (info) => <code className="font-mono text-xs">{info.getValue()}</code>,
      }),
      columnHelper.accessor('vendorName', {
        header: 'Vendor',
        cell: (info) => <span className="truncate text-xs">{info.getValue()}</span>,
      }),
      columnHelper.accessor('invoiceNumber', {
        header: 'Invoice #',
        cell: (info) => <code className="font-mono text-[11px] text-muted-foreground">{info.getValue()}</code>,
      }),
      columnHelper.accessor('amountUsd', {
        header: 'Amount',
        cell: (info) => (
          <span className="font-mono text-xs">
            ${Number(info.getValue()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ),
      }),
      columnHelper.accessor('riskScore', {
        header: 'Risk',
        cell: (info) => <RiskGauge score={info.getValue()} showLabel={false} className="w-24" />,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue() as CaseRecord['status']} />,
      }),
      columnHelper.accessor('recommendation', {
        header: 'Recommendation',
        cell: (info) => <RecommendationBadge rec={info.getValue() as CaseRecord['recommendation']} />,
      }),
      columnHelper.accessor('decision', {
        header: 'Decision',
        cell: (info) => <DecisionBadge decision={info.getValue() as CaseRecord['decision']} />,
      }),
      columnHelper.accessor('fraudType', {
        header: 'Fraud type',
        cell: (info) =>
          info.getValue() ? (
            <span className="text-[10px] uppercase tracking-wider text-red-300">{info.getValue()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
    ],
    [],
  );

  const rows = data?.items ?? [];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination: { pageIndex: page, pageSize } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
  });

  const exportCsv = () => {
    const sorted = table.getSortedRowModel().rows.map((r) => r.original);
    const header = ['caseId', 'vendor', 'invoice', 'amountUsd', 'currency', 'riskScore', 'status', 'recommendation', 'decision', 'approver', 'fraudType', 'isFraud'];
    const lines = [header.join(',')];
    for (const r of sorted) {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      lines.push([
        esc(r.caseId),
        esc(r.vendorName),
        esc(r.invoiceNumber),
        r.amountUsd.toFixed(2),
        esc(r.currency),
        r.riskScore.toFixed(2),
        esc(r.status),
        esc(r.recommendation),
        esc(r.decision),
        esc(r.approver),
        esc(r.fraudType),
        String(r.isFraud),
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apf-sentinel-cases-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Cases ({data?.total ?? 0})</span>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="search" className="text-xs">Search</Label>
              <Input
                id="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="caseId, invoice #, or vendor name…"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(0); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="all statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all</SelectItem>
                  {STATUS_OPTIONS.filter(Boolean).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Fraud type</Label>
              <Select value={fraudType} onValueChange={(v) => { setFraudType(v === 'all' ? '' : v); setPage(0); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="all fraud types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all</SelectItem>
                  {FRAUD_OPTIONS.filter(Boolean).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader className="bg-muted/30">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    {hg.headers.map((header) => {
                      const sortable = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead key={header.id} className="text-[11px] uppercase tracking-wider">
                          {sortable ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="flex items-center gap-1"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === 'asc' ? <ChevronUp className="h-3 w-3" /> : sorted === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading || isFetching ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="p-0">
                      <Skeleton className="h-12 w-full rounded-none" />
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="py-6 text-center text-sm text-muted-foreground">
                      No cases match.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      onClick={() => selectCase(row.original.caseId)}
                      className="cursor-pointer hover:bg-muted/30"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              showing {table.getState().pagination.pageIndex * pageSize + 1}–
              {Math.min((table.getState().pagination.pageIndex + 1) * pageSize, rows.length)} of {rows.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="font-mono">
                {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
