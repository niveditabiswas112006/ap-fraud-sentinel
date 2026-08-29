'use client';

// VendorsView — paginated vendor list with payment stats & bulk CSV import.

import { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Building2, Search, Edit2, Save, X, Plus, Upload, FileText } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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

function maskedBank(acct?: string) {
  if (!acct) return '—';
  const clean = acct.trim();
  if (clean.length <= 4) return clean;
  return `•••• ${clean.slice(-4)}`;
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
  const currency = useAppStore((state) => state.currency);
  const currSymbol = currency === 'INR' ? '₹' : '$';

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
        description: 'Vendor details updated successfully in SQLite database.',
      });
      setIsEditing(false);
    } catch (err) {
      toast({
        title: 'Update Error',
        description: err instanceof Error ? err.message : String(err),
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
      if (!res.ok) throw new Error('Failed to create vendor');
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Vendor Added',
        description: `${addForm.legalName} registered as a ground-truth vendor.`,
      });
      setIsAdding(false);
      setAddForm({
        legalName: '',
        registeredDomain: '',
        knownPhone: '',
        knownBankAccount: '',
        contactEmail: '',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCsvSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const text = await file.text();
    const rows = parseVendorCsv(text);
    setParsedCsvVendors(rows);
  };

  const handleImportCsv = async () => {
    if (!parsedCsvVendors.length) {
      toast({
        title: 'No vendor data found',
        description: 'The CSV file did not contain valid vendor rows.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendors: parsedCsvVendors }),
      });
      if (!res.ok) throw new Error('Bulk CSV import failed');
      const j = await res.json();
      toast({
        title: 'CSV Import Successful',
        description: `Successfully imported ${j.count || parsedCsvVendors.length} vendors into database.`,
      });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setIsAdding(false);
      setCsvFile(null);
      setParsedCsvVendors([]);
    } catch (err) {
      toast({
        title: 'Import Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Search Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs bg-white border-slate-200"
          />
        </div>

        <Button
          onClick={() => setIsAdding(true)}
          className="gap-2 rounded-full bg-[#00668c] hover:bg-[#005577] text-white text-xs font-extrabold px-5 py-2.5 shadow-sm cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add Vendor</span>
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#00668c]" />
            <h2 className="text-sm font-bold text-slate-800">
              Vendors ({data?.total ?? 0})
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase">ID</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase">LEGAL NAME</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase">DOMAIN</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase">BANK (MASK)</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase">PAYMENTS</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase">MEAN ({currSymbol})</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase">STD ({currSymbol})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((v) => (
                  <TableRow
                    key={v.vendorId}
                    onClick={() => setSelected(v.vendorId)}
                    className="cursor-pointer hover:bg-sky-50/50 transition-colors"
                  >
                    <TableCell className="font-mono text-xs font-semibold text-slate-900">{v.vendorId}</TableCell>
                    <TableCell className="text-xs font-medium text-slate-800">{v.legalName}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{v.registeredDomain}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{maskedBank(v.knownBankAccount)}</TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-slate-700">{v.paymentCount}</TableCell>
                    <TableCell className="font-mono text-xs font-bold text-slate-900">
                      {formatCurrency(v.amountMean, currency)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {formatCurrency(v.amountStd, currency)}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-xs text-slate-500">
                      No vendors found. Click &quot;+ Add Vendor&quot; to register vendors or import a .csv file.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Detail Sparkline Modal Dialog */}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setIsEditing(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  {vendorDetail?.vendor.legalName ?? selected}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs text-slate-500">
                  {selected} · {vendorDetail?.vendor.registeredDomain}
                </DialogDescription>
              </div>

              {!isEditing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="h-8 gap-1.5 text-xs font-bold text-[#00668c] border-sky-200 bg-sky-50 hover:bg-sky-100 cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit Vendor
                </Button>
              )}
            </div>
          </DialogHeader>

          {vendorDetail && (
            <div className="flex flex-col gap-6 py-2">
              {/* Edit Mode inline form */}
              {isEditing ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 flex flex-col gap-3">
                  <h3 className="text-xs font-extrabold text-[#00668c] flex items-center gap-1.5">
                    <Edit2 className="h-3.5 w-3.5" /> Edit Vendor Information
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600">Legal Name</label>
                      <Input
                        value={editForm.legalName}
                        onChange={(e) => setEditForm((f) => ({ ...f, legalName: e.target.value }))}
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600">Registered Domain</label>
                      <Input
                        value={editForm.registeredDomain}
                        onChange={(e) => setEditForm((f) => ({ ...f, registeredDomain: e.target.value }))}
                        className="h-8 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600">Phone</label>
                      <Input
                        value={editForm.knownPhone}
                        onChange={(e) => setEditForm((f) => ({ ...f, knownPhone: e.target.value }))}
                        className="h-8 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600">Bank Account</label>
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
                      className="h-7 text-xs font-semibold"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving}
                      className="h-7 gap-1.5 text-xs font-extrabold bg-[#00668c] hover:bg-[#005577] text-white cursor-pointer"
                    >
                      <Save className="h-3 w-3" />
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Phone</span>
                    <span className="font-mono text-slate-700 font-bold">{vendorDetail.vendor.knownPhone ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Bank Account</span>
                    <span className="font-mono text-slate-700 font-bold">{vendorDetail.vendor.knownBankAccount ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Contact Email</span>
                    <span className="text-slate-700 font-bold">{vendorDetail.vendor.contactEmail ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Tax ID</span>
                    <span className="font-mono text-slate-700 font-bold">{vendorDetail.vendor.taxId ?? '—'}</span>
                  </div>
                </div>
              )}

              {/* Sparkline Chart */}
              <div>
                <h3 className="mb-3 text-xs font-bold text-slate-800">
                  Payment History Sparkline ({vendorDetail.payments.length} Payments)
                </h3>
                <div className="h-48 w-full rounded-xl border border-slate-100 bg-slate-50/30 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={vendorDetail.payments.map((p) => ({ date: p.paidDate, amount: Number(p.amountUsd) }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="amount" stroke="#00668c" strokeWidth={2} dot={{ r: 3, fill: '#00668c' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Payments Table */}
              <div>
                <h3 className="mb-2 text-xs font-bold text-slate-800">Recent Payment Records</h3>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] font-bold">PAYMENT ID</TableHead>
                      <TableHead className="text-[10px] font-bold">INVOICE #</TableHead>
                      <TableHead className="text-[10px] font-bold">DATE</TableHead>
                      <TableHead className="text-[10px] font-bold text-right">AMOUNT</TableHead>
                      <TableHead className="text-[10px] font-bold">CURRENCY</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorDetail.payments.map((p) => (
                      <TableRow key={p.paymentId}>
                        <TableCell><code className="font-mono text-xs">{p.paymentId}</code></TableCell>
                        <TableCell><code className="font-mono text-[11px] text-muted-foreground">{p.invoiceNumber}</code></TableCell>
                        <TableCell><code className="font-mono text-[11px]">{p.paidDate}</code></TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(p.amountUsd, currency)}</TableCell>
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
                  <FileText className="h-5 w-5" />
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
