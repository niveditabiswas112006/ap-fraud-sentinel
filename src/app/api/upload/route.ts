// POST /api/upload — multipart file upload for the user's own dataset.
//
// Accepts .csv, .pdf, .eml, .json, .txt files (the user's PC dataset is in
// CSV/PDF/EML format, so those are first-class). Routing by extension:
//
//   .csv  → saved to /data/<filename>            (overwrites the reference
//                                                   master — vendor_master,
//                                                   payment_history,
//                                                   fraud_ground_truth)
//                                                   then triggers a worker
//                                                   /reload-reference call so
//                                                   the DB reflects the new
//                                                   data immediately.
//   .pdf  → saved to /data/uploads/<run_id>/     (scanned by the worker's
//                                                   _list_invoice_files when
//                                                   /api/runs is called with
//                                                   batch_path=data/uploads/<run_id>)
//   .eml  → saved to /data/uploads/<run_id>/     (scanned by _list_email_files
//                                                   — same batch_path)
//   .json | .txt → saved to /data/uploads/<run_id>/  (legacy pre-extracted
//                                                   case JSON)
//
// Returns {run_id, files_received, names, files, csv_reloaded?}.
// Does NOT auto-trigger a worker run — the dashboard's UploadView calls
// /api/runs separately after upload (keeps the user in control).

import { NextResponse } from 'next/server';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT_ROOT = process.cwd();
const UPLOAD_ROOT = path.join(PROJECT_ROOT, 'data', 'uploads');
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3030';

// The three reference CSVs the worker grounds against. Anything else with a
// .csv extension goes into the upload dir (treated as a case attachment).
const REFERENCE_CSV_NAMES = new Set([
  'vendor_master.csv',
  'payment_history.csv',
  'fraud_ground_truth.csv',
]);

interface SavedFile {
  name: string;
  size: number;
  path: string;
  kind: 'reference-csv' | 'case';
}

async function triggerReloadReference(): Promise<{ vendors: number; payments: number; ground_truth: number } | undefined> {
  try {
    const r = await fetch(`${WORKER_URL}/reload-reference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { reloaded?: { vendors: number; payments: number; ground_truth: number } };
    return j.reloaded;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  let runId = '';
  const ct = req.headers.get('content-type') ?? '';

  if (!ct.toLowerCase().includes('multipart/form-data')) {
    // Fallback: accept a JSON body {run_id?, files: [{name, content}]}
    let json: { run_id?: string; files?: { name: string; content?: string }[] };
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'expected multipart/form-data or json' }, { status: 400 });
    }
    runId = (json.run_id ?? '').toString().trim() || `upload-${Date.now()}`;
    const uploadDir = path.join(UPLOAD_ROOT, runId);
    await mkdir(uploadDir, { recursive: true }).catch(() => {});
    const saved: SavedFile[] = [];
    let hadReferenceCsv = false;
    for (const f of json.files ?? []) {
      const safe = path.basename(f.name);
      if (!safe) continue;
      const lower = safe.toLowerCase();
      const isRefCsv = REFERENCE_CSV_NAMES.has(lower);
      const destDir = isRefCsv ? DATA_ROOT : uploadDir;
      const fp = path.join(destDir, safe);
      await writeFile(fp, (f.content ?? '').toString(), 'utf8').catch(() => {});
      const s = await stat(fp).then((s) => s.size).catch(() => 0);
      if (isRefCsv) hadReferenceCsv = true;
      saved.push({ name: safe, size: s, path: relativePath(fp), kind: isRefCsv ? 'reference-csv' : 'case' });
    }
    let csvReloaded: { vendors: number; payments: number; ground_truth: number } | undefined;
    if (hadReferenceCsv) csvReloaded = await triggerReloadReference();
    return NextResponse.json({
      run_id: runId,
      files_received: saved.length,
      names: saved.map((s) => s.name),
      files: saved,
      ...(csvReloaded ? { csv_reloaded: csvReloaded } : {}),
    });
  }

  // Multipart path — the main drag-and-drop flow.
  const form = await req.formData();
  runId = (form.get('run_id') as string | null)?.toString().trim() || `upload-${Date.now()}`;
  const uploadDir = path.join(UPLOAD_ROOT, runId);
  await mkdir(uploadDir, { recursive: true }).catch(() => {});
  const saved: SavedFile[] = [];
  let hadReferenceCsv = false;

  for (const [name, value] of form.entries()) {
    if (name === 'run_id') continue;
    if (!(value instanceof File)) continue;
    const safe = path.basename(value.name || name);
    if (!safe) continue;
    const lower = safe.toLowerCase();
    const isRefCsv = REFERENCE_CSV_NAMES.has(lower);
    const destDir = isRefCsv ? DATA_ROOT : uploadDir;
    const fp = path.join(destDir, safe);
    const buf = Buffer.from(await value.arrayBuffer());
    await writeFile(fp, buf).catch(() => {});
    saved.push({ name: safe, size: buf.byteLength, path: relativePath(fp), kind: isRefCsv ? 'reference-csv' : 'case' });
    if (isRefCsv) hadReferenceCsv = true;
  }

  // If any reference CSV was uploaded, tell the worker to re-import the CSVs
  // into the DB so the Vendors view + payment-history sparklines reflect the
  // user's actual dataset before they click "Start batch run".
  let csvReloaded: { vendors: number; payments: number; ground_truth: number } | undefined;
  if (hadReferenceCsv) csvReloaded = await triggerReloadReference();

  return NextResponse.json({
    run_id: runId,
    files_received: saved.length,
    names: saved.map((s) => s.name),
    files: saved,
    ...(csvReloaded ? { csv_reloaded: csvReloaded } : {}),
  });
}

function relativePath(absPath: string): string {
  return path.relative(PROJECT_ROOT, absPath).split(path.sep).join('/');
}
