// GET /api/download — bundles the whole project as a ready-to-run ZIP for the
// user's own PC. Differences vs. this hosted sandbox tree:
//   * .env is injected with a portable relative DATABASE_URL (no /home/z paths)
//   * package.json scripts are rewritten (no `tee dev.log`, standard next
//     build/start, plus `npm run ws` / `npm run worker` conveniences)
//   * runtime junk is excluded (node_modules, .next, logs, runtime audio,
//     uploads, the SQLite db itself — setup scripts recreate it)
// The archive is built in memory with src/lib/zip.ts (no deps).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ZipWriter } from '@/lib/zip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
const PREFIX = 'ap-fraud-sentinel';

/** Top-level directories to bundle (everything else at root is sandbox junk). */
const INCLUDE_DIRS = [
  'src',
  'prisma',
  'worker',
  'pipelines',
  'scripts',
  'data',
  'public',
  'mini-services/pipeline-ws',
  '.vscode',
];

/** Top-level files to bundle as-is. */
const INCLUDE_FILES = [
  'SETUP.md',
  'VSCODE_GUIDE.md',
  'setup.sh',
  'setup.bat',
  'start.sh',
  'start.bat',
  '.env.example',
  'next.config.ts',
  'tsconfig.json',
  'tailwind.config.ts',
  'postcss.config.mjs',
  'components.json',
  'eslint.config.mjs',
  'next-env.d.ts',
];

/** Skip these names during recursive walks. */
const SKIP_NAMES = new Set([
  'node_modules',
  '.next',
  '.git',
  '.DS_Store',
  'calls', // runtime TTS audio output (regenerated on the PC)
  'uploads', // runtime upload staging
]);

function isSkippedFile(base: string): boolean {
  return base.endsWith('.log') || base === '.DS_Store' || base.startsWith('verify-');
}

async function walkDir(zip: ZipWriter, absDir: string, relDir: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const abs = path.join(absDir, entry.name);
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      count += await walkDir(zip, abs, rel);
    } else if (entry.isFile()) {
      if (isSkippedFile(entry.name)) continue;
      const data = await fs.readFile(abs);
      const st = await fs.stat(abs);
      zip.add(`${PREFIX}/${rel}`, data, { mtime: st.mtime, mode: st.mode });
      count += 1;
    }
  }
  return count;
}

/** PC-friendly package.json: standard next scripts + service conveniences. */
function buildPcPackageJson(original: unknown): string {
  const pkg = (typeof original === 'object' && original !== null ? original : {}) as { scripts?: Record<string, string>; [key: string]: unknown };
  const scripts: Record<string, string> = {
    ...(pkg.scripts ?? {}),
    dev: 'next dev -p 3000',
    build: 'next build',
    start: 'next start -p 3000',
    ws: 'node mini-services/pipeline-ws/index.js',
    worker: 'python worker/main.py',
  };
  return JSON.stringify({ ...pkg, scripts }, null, 2);
}

/** Portable .env — relative SQLite path resolves from prisma/schema.prisma. */
const PC_ENV = `DATABASE_URL=file:../db/custom.db

# AP Payment Fraud Sentinel
# Leave ROCKETRIDE_API_KEY empty to run the pipeline fully locally.
ROCKETRIDE_API_KEY=
ROCKETRIDE_WEBHOOK_SECRET=
ROCKETRIDE_SERVICE_URL=https://api.rocketride.ai
WORKER_PORT=3030
WS_PORT=3003
`;

export async function GET() {
  try {
    const zip = new ZipWriter();
    let count = 0;

    // 1. Directory trees.
    for (const dir of INCLUDE_DIRS) {
      const abs = path.join(ROOT, dir);
      try {
        await fs.access(abs);
      } catch {
        continue;
      }
      count += await walkDir(zip, abs, dir);
    }

    // 2. Top-level files.
    for (const file of INCLUDE_FILES) {
      try {
        const abs = path.join(ROOT, file);
        const data = await fs.readFile(abs);
        const st = await fs.stat(abs);
        const mode = file.endsWith('.sh') ? 0o755 : 0o644;
        zip.add(`${PREFIX}/${file}`, data, { mtime: st.mtime, mode });
        count += 1;
      } catch {
        // Optional file missing — skip.
      }
    }

    // 3. Rewritten package.json (portable scripts).
    const pkgRaw = await fs.readFile(path.join(ROOT, 'package.json'), 'utf8');
    zip.add(`${PREFIX}/package.json`, Buffer.from(buildPcPackageJson(JSON.parse(pkgRaw))));
    count += 1;

    // 4. Injected .env + db placeholder so prisma/db push has its folder.
    zip.add(`${PREFIX}/.env`, Buffer.from(PC_ENV));
    zip.add(`${PREFIX}/db/.gitkeep`, Buffer.alloc(0));
    count += 2;

    const archive = zip.end();
    return new Response(new Uint8Array(archive), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="ap-fraud-sentinel.zip"',
        'Content-Length': String(archive.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return Response.json(
      { error: 'failed to build archive', detail: String(err) },
      { status: 500 },
    );
  }
}
