'use client';

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
import { Download, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useCases } from '@/hooks/useDashboardData';
import { useAppStore, formatCurrency } from '@/lib/store';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CaseRecord } from '@/lib/types';

const columnHelper = createColumnHelper<CaseRecord>();

export function CasesView() {
  const [status, setStatus] = useState('all');
  const [fraudType, setFraudType] = useState('all');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'riskScore', desc: true }]);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const { data, isLoading } = useCases({
    status: status === 'all' ? undefined : status,
    fraud_type: fraudType === 'all' ? undefined : fraudType,
    search: search || undefined,
    page: page + 1,
    limit: pageSize,
  });

  const selectCase = useAppStore((s) => s.selectCase);

  const columns = useMemo(
    () => [
      columnHelper.accessor('caseId', {
        header: 'CASE ID',
        cell: (info) => <code className="font-mono text-xs font-bold text-slate-800">{info.getValue()}</code>,
      }),
      columnHelper.accessor('vendorName', {
        header: 'VENDOR',
        cell: (info) => <span className="font-medium text-slate-800 text-xs">{info.getValue()}</span>,
      }),
      columnHelper.accessor('invoiceNumber', {
        header: 'INVOICE #',
        cell: (info) => <code className="font-mono text-xs text-slate-600">{info.getValue()}</code>,
      }),
      columnHelper.accessor('amountUsd', {
        header: 'AMOUNT',
        cell: (info) => (
          <span className="font-mono text-xs font-bold text-slate-900">
            {formatCurrency(info.getValue(), useAppStore.getState().currency)}
          </span>
        ),
      }),
      columnHelper.accessor('riskScore', {
        header: 'RISK SCORE',
        cell: (info) => {
          const score = info.getValue();
          const isHigh = score >= 0.7;
          const isMed = score >= 0.4;
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn('h-full', isHigh ? 'bg-red-600' : isMed ? 'bg-amber-500' : 'bg-[#0284c7]')}
                  style={{ width: `${Math.round(score * 100)}%` }}
                />
              </div>
              <span className={cn('font-mono text-xs font-bold', isHigh ? 'text-red-600' : isMed ? 'text-amber-600' : 'text-[#0284c7]')}>
                {score.toFixed(2)}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor('recommendation', {
        header: 'STATUS',
        cell: (info) => {
          const rec = info.getValue();
          if (rec === 'hold') {
            return (
              <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-[10px] font-extrabold text-red-700 border border-red-200">
                FRAUD SUSPECTED
              </span>
            );
          }
          return (
            <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-[10px] font-extrabold text-[#00668c] border border-sky-200">
              CLEARED
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'ACTION',
        cell: ({ row }) => {
          const isHold = row.original.recommendation === 'hold';
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                selectCase(row.original.caseId);
              }}
              className={cn(
                'rounded-full px-4 text-[11px] font-bold tracking-wider uppercase h-7',
                isHold
                  ? 'border-red-300 text-red-600 hover:bg-red-50'
                  : 'border-[#00668c] text-[#00668c] hover:bg-sky-50',
              )}
            >
              {isHold ? 'HOLD' : 'RELEASE'}
            </Button>
          );
        },
      }),
    ],
    [selectCase],
  );

  const rows = data?.items ?? [];
  const totalCases = data?.total ?? 0;
  const totalPages = Math.ceil(totalCases / pageSize) || 1;

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination: { pageIndex: page, pageSize } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const exportCsv = () => {
    const sorted = table.getSortedRowModel().rows.map((r) => r.original);
    const header = ['caseId', 'vendor', 'invoice', 'amountUsd', 'riskScore', 'recommendation'];
    const lines = [header.join(',')];
    for (const r of sorted) {
      lines.push([r.caseId, `"${r.vendorName}"`, r.invoiceNumber, r.amountUsd, r.riskScore, r.recommendation].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cases-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Page Title & Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Cases <span className="text-slate-500 font-normal">({totalCases})</span>
        </h1>

        <div className="flex items-center gap-3">
          <div className="relative w-64 sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search case, vendor, invoice..."
              className="rounded-full bg-slate-100 border-none pl-9 pr-4 text-xs shadow-inner focus-visible:ring-1 focus-visible:ring-[#00668c]"
            />
          </div>
          <Button
            onClick={exportCsv}
            className="rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-5 gap-2"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Tabs matching Reference Screenshot 2 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex items-center gap-1 rounded-full bg-slate-200/70 p-1">
          {['all', 'scored', 'held', 'closed'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setStatus(tab); setPage(0); }}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-bold capitalize transition-all',
                status === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Category Type Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filter Type</span>
          </div>
          {[
            { id: 'bec', label: 'BEC' },
            { id: 'invoice_fraud', label: 'Invoice fraud' },
            { id: 'duplicate', label: 'Duplicate' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setFraudType(fraudType === cat.id ? 'all' : cat.id);
                setPage(0);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-bold transition-all border',
                fraudType === cat.id
                  ? 'bg-sky-100 text-[#005577] border-sky-300 shadow-sm'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-100/70">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 py-3">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-4">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-12 text-center text-sm text-slate-500">
                  No cases found for the selected filter.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => selectCase(row.original.caseId)}
                  className="cursor-pointer hover:bg-slate-50 border-b border-slate-100"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination matching Reference Image 2 */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs font-semibold text-slate-500">
          <span>Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCases)} of {totalCases} cases</span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="p-1.5 rounded-full hover:bg-slate-100 disabled:opacity-30 border border-slate-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => (
              <button
                key={idx}
                onClick={() => setPage(idx)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full font-bold transition-all text-xs',
                  page === idx ? 'bg-[#0284c7] text-white shadow-sm' : 'hover:bg-slate-100 text-slate-700',
                )}
              >
                {idx + 1}
              </button>
            ))}
            {totalPages > 5 && <span className="px-1">...</span>}
            {totalPages > 5 && (
              <button
                onClick={() => setPage(totalPages - 1)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full font-bold transition-all text-xs',
                  page === totalPages - 1 ? 'bg-[#0284c7] text-white shadow-sm' : 'hover:bg-slate-100 text-slate-700',
                )}
              >
                {totalPages}
              </button>
            )}
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="p-1.5 rounded-full hover:bg-slate-100 disabled:opacity-30 border border-slate-200"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

