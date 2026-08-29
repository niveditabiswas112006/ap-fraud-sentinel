'use client';

// VendorsView — read-only table of all 60 vendors with payment stats. Clicking a row
// opens a modal with the vendor's payment-history sparkline (recharts).

import { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Building2, Search, Edit2, Save, X, Plus, Upload, FileSpreadsheet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
import { useAppStore, formatCurrency } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { VendorRecord } from '@/lib/types';

function maskedBank(acct?: string) {
  if (!acct) return '—';
  if (acct.length <= 4) return acct.replace(/./g, '•');
  return `${acct.slice(0, 4)}••••${acct.slice(-4)}`;
}

function parseVendorCsv(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const getIdx = (keys: string[]) => {
    for (const k of keys) {
      const idx = headers.indexOf(k);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameIdx = getIdx(['legalname', 'name', 'vendorname', 'vendor']);
  const domainIdx = getIdx(['registereddomain', 'domain', 'website']);
  const phoneIdx = getIdx(['knownphone', 'phone', 'contactphone']);
  const bankIdx = getIdx(['knownbankaccount', 'bankaccount', 'bank', 'account']);
  const emailIdx = getIdx(['contactemail', 'email']);
  const idIdx = getIdx(['vendorid', 'id']);
  const addressIdx = getIdx(['address']);
  const taxIdx = getIdx(['taxid']);

  const vendors = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    const legalName = nameIdx !== -1 ? row[nameIdx] : '';
    const registeredDomain = domainIdx !== -1 ? row[domainIdx] : '';

    if (legalName || registeredDomain) {
      vendors.push({
        vendorId: idIdx !== -1 && row[idIdx] ? row[idIdx] : undefined,
        legalName: legalName || registeredDomain,
        registeredDomain: registeredDomain || legalName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com',
        knownPhone: phoneIdx !== -1 && row[phoneIdx] ? row[phoneIdx] : '+1 (555) 000-0000',
        knownBankAccount: bankIdx !== -1 && row[bankIdx] ? row[bankIdx] : '1234567890',
        contactEmail: emailIdx !== -1 && row[emailIdx] ? row[emailIdx] : `ap@${registeredDomain || 'vendor.com'}`,
        address: addressIdx !== -1 && row[addressIdx] ? row[addressIdx] : '100 Enterprise Way',
        taxId: taxIdx !== -1 && row[taxIdx] ? row[taxIdx] : 'XX-XXXXXXX',
      });
    }
  }

  return vendors;
}

export function VendorsView() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'csv'>('single');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedCsvVendors, setParsedCsvVendors] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    legalName: '',
    registeredDomain: '',
    knownPhone: '',
    knownBankAccount: '',
  });
  const [addForm, setAddForm] = useState({
    legalName: '',
    registeredDomain: '',
    knownPhone: '',
    knownBankAccount: '',
    contactEmail: '',
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useVendors(1, 100, search);
  const { data: vendorDetail } = useVendor(selected);

  useEffect(() => {
    if (vendorDetail?.vendor) {
      setEditForm({
        legalName: vendorDetail.vendor.legalName ?? '',
        registeredDomain: vendorDetail.vendor.registeredDomain ?? '',
        knownPhone: vendorDetail.vendor.knownPhone ?? '',
        knownBankAccount: vendorDetail.vendor.knownBankAccount ?? '',
      });
    }
  }, [vendorDetail]);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/vendors/${encodeURIComponent(selected)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('Failed to update vendor');
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      await queryClient.invalidateQueries({ queryKey: ['vendor', selected] });
      toast({
        title: 'Vendor Updated',
        description: `Successfully updated ${editForm.legalName || selected}.`,
      });
      setIsEditing(false);
    } catch (e) {
      toast({
        title: 'Update Failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddVendor = async () => {
    if (!addForm.legalName || !addForm.registeredDomain) {
      toast({
        title: 'Missing Fields',
        description: 'Legal Name and Registered Domain are required.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) throw new Error('Failed to add vendor');
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Vendor Added',
        description: `Successfully added vendor ${addForm.legalName}.`,
      });
      setIsAdding(false);
      setAddForm({ legalName: '', registeredDomain: '', knownPhone: '', knownBankAccount: '', contactEmail: '' });
    } catch (e) {
      toast({
        title: 'Add Vendor Failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-bold">
              <Building2 className="h-4 w-4 text-[#7fb8d6]" />
              Vendors ({data?.total ?? 0})
            </span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search vendors…"
                  className="h-8 w-48 pl-7 text-xs"
                />
              </div>
              <Button
                size="sm"
                onClick={() => setIsAdding(true)}
                className="h-8 gap-1.5 text-xs font-extrabold bg-[#00668c] hover:bg-[#005577] text-white cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Vendor
              </Button>
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
                      onClick={() => {
                        setSelected(v.vendorId);
                        setIsEditing(false);
                      }}
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

      <Dialog open={Boolean(selected)} onOpenChange={(o) => { if (!o) { setSelected(null); setIsEditing(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="flex flex-row items-center justify-between pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-[#1f6c92]" />
                {vendorDetail?.vendor.legalName ?? selected}
              </DialogTitle>
              <DialogDescription className="text-xs">
                <code className="font-mono">{vendorDetail?.vendor.vendorId ?? selected}</code> ·{' '}
                <code className="font-mono">{vendorDetail?.vendor.registeredDomain}</code>
              </DialogDescription>
            </div>
            <Button
              size="sm"
              variant={isEditing ? "ghost" : "outline"}
              onClick={() => setIsEditing(!isEditing)}
              className="h-8 gap-1.5 text-xs font-bold"
            >
              {isEditing ? <X className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5 text-[#00668c]" />}
              {isEditing ? "Cancel Edit" : "Edit Vendor"}
            </Button>
          </DialogHeader>

          {vendorDetail && (
            <div className="flex flex-col gap-4">
              {isEditing ? (
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Edit Vendor Attributes</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Legal Name</label>
                      <Input
                        value={editForm.legalName}
                        onChange={(e) => setEditForm((f) => ({ ...f, legalName: e.target.value }))}
                        className="h-8 text-xs font-medium bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Registered Domain</label>
                      <Input
                        value={editForm.registeredDomain}
                        onChange={(e) => setEditForm((f) => ({ ...f, registeredDomain: e.target.value }))}
                        className="h-8 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Verified Phone</label>
                      <Input
                        value={editForm.knownPhone}
                        onChange={(e) => setEditForm((f) => ({ ...f, knownPhone: e.target.value }))}
                        className="h-8 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Known Bank Account</label>
                      <Input
                        value={editForm.knownBankAccount}
                        onChange={(e) => setEditForm((f) => ({ ...f, knownBankAccount: e.target.value }))}
                        className="h-8 text-xs font-mono bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      className="h-8 text-xs font-semibold"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving}
                      className="h-8 gap-1.5 text-xs font-extrabold bg-[#00668c] hover:bg-[#005577] text-white"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              ) : (
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
              )}

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
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(p.amountUsd, useAppStore.getState().currency)}</TableCell>
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

      {/* Add Vendor Modal Dialog */}
      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <Building2 className="h-4 w-4 text-[#00668c]" />
              Register New Vendor
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add single vendor details or import a full .csv vendor database.
            </DialogDescription>
          </DialogHeader>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-bold my-1">
            <button
              type="button"
              onClick={() => setAddMode('single')}
              className={cn(
                'rounded-lg py-1.5 transition-all cursor-pointer select-none',
                addMode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              Single Entry
            </button>
            <button
              type="button"
              onClick={() => setAddMode('csv')}
              className={cn(
                'rounded-lg py-1.5 transition-all cursor-pointer select-none flex items-center justify-center gap-1.5',
                addMode === 'csv' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              <Upload className="h-3.5 w-3.5 text-[#00668c]" />
              Bulk CSV Import
            </button>
          </div>

          {addMode === 'single' ? (
            <div className="flex flex-col gap-3 pt-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700">Legal Company Name *</label>
                <Input
                  placeholder="e.g. Apex Industrial Solutions"
                  value={addForm.legalName}
                  onChange={(e) => setAddForm((f) => ({ ...f, legalName: e.target.value }))}
                  className="h-8 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Registered Domain *</label>
                <Input
                  placeholder="e.g. apex-industrial.com"
                  value={addForm.registeredDomain}
                  onChange={(e) => setAddForm((f) => ({ ...f, registeredDomain: e.target.value }))}
                  className="h-8 text-xs font-mono bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Verified Phone Number</label>
                <Input
                  placeholder="e.g. +1 (555) 019-2831"
                  value={addForm.knownPhone}
                  onChange={(e) => setAddForm((f) => ({ ...f, knownPhone: e.target.value }))}
                  className="h-8 text-xs font-mono bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Known Bank Account</label>
                <Input
                  placeholder="e.g. 9876543210"
                  value={addForm.knownBankAccount}
                  onChange={(e) => setAddForm((f) => ({ ...f, knownBankAccount: e.target.value }))}
                  className="h-8 text-xs font-mono bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Contact Email</label>
                <Input
                  placeholder="e.g. ap@apex-industrial.com"
                  value={addForm.contactEmail}
                  onChange={(e) => setAddForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  className="h-8 text-xs bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAdding(false)}
                  className="h-8 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddVendor}
                  disabled={saving}
                  className="h-8 gap-1.5 text-xs font-extrabold bg-[#00668c] hover:bg-[#005577] text-white cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Add Vendor"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <label
                htmlFor="vendor-csv-input"
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center transition-all cursor-pointer hover:border-[#00668c] hover:bg-white"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-[#00668c]">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-slate-800">
                    {csvFile ? csvFile.name : 'Click to select or drop vendor .csv file'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Supports vendor_master.csv with legalName, domain, phone, bank columns
                  </span>
                </div>
                <input
                  id="vendor-csv-input"
                  type="file"
                  accept=".csv"
                  onChange={handleCsvSelect}
                  className="hidden"
                />
              </label>

              {parsedCsvVendors.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 font-bold flex items-center justify-between">
                  <span>Detected {parsedCsvVendors.length} valid vendor records</span>
                  <span className="text-[10px] text-emerald-600 font-normal">Ready to import</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAdding(false)}
                  className="h-8 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleImportCsv}
                  disabled={saving || !parsedCsvVendors.length}
                  className="h-8 gap-1.5 text-xs font-extrabold bg-[#00668c] hover:bg-[#005577] text-white cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {saving ? "Importing..." : `Import ${parsedCsvVendors.length} Vendors`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
