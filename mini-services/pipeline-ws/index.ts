// pipeline-ws — WebSocket trace mini-service for the AP Payment Fraud Sentinel.
//
// Standalone Bun project. Receives pipeline trace events from the Python worker
// (Task 2-b) via plain HTTP POST /trace, and broadcasts them to Next.js
// dashboard clients over socket.io on the 'trace' event.
//
// Port: 3003 (hardcoded — do NOT use PORT env).
// socket.io path: '/' (Caddy relies on this — do NOT change).
// Dashboard connects with: io('/?XTransformPort=3003')  (never io('http://localhost:3003'))
//
// TraceEvent shape mirrors src/lib/types.ts (re-declared locally; this is a
// standalone project that does not import from the Next.js src/ tree).
//
// IMPLEMENTATION NOTE: socket.io's `attach()` installs an HTTP request wrapper
// that calls `engine.handleRequest` whenever the request URL starts with the
// configured path. With `path: '/'` (required by Caddy), that test matches
// EVERY URL, which would swallow /healthz and /trace. To keep both our HTTP
// routes and socket.io working, we replace that wrapper with a smarter
// dispatcher that routes engine.io requests (those carrying the EIO/transport
// query params, or the /socket.io.js client path, or matching upgrade
// requests) to io.engine, and everything else to our own router.

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server, Socket } from 'socket.io';

// ---- Local type re-declaration (matches src/lib/types.ts TraceEvent) ----
export type StageName =
  | 'intake'
  | 'extraction'
  | 'grounding'
  | 'signals'
  | 'agents'
  | 'verification'
  | 'gate';

export type CaseStatus =
  | 'queued'
  | 'extracted'
  | 'grounded'
  | 'scored'
  | 'reviewed'
  | 'verified'
  | 'closed'
  | 'quarantined';

export interface TraceStage {
  name: StageName;
  label: string;
  status: 'idle' | 'running' | 'blocked' | 'complete' | 'failed';
  startedAt?: number;
  completedAt?: number;
  casesInStage?: number;
}

export interface TraceEvent {
  type: 'run_started' | 'run_completed' | 'stage' | 'case' | 'log';
  runId: string;
  stage?: StageName;
  stageStatus?: TraceStage['status'];
  caseId?: string;
  caseStatus?: CaseStatus;
  message?: string;
  timestamp: number;
}

// ---- Config ----
// Dedicated WS_PORT env override (default 3003). Never PORT — that's the
// generic env the sandbox may set for other services.
const PORT = Number(process.env.WS_PORT ?? 3003);

// ---- HTTP router (our routes) ----
function router(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  // GET /healthz — liveness probe
  if (req.method === 'GET' && pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'pipeline-ws', port: PORT }));
    return;
  }

  // POST /trace — worker pushes a TraceEvent JSON body, broadcast on 'trace'
  if (req.method === 'POST' && pathname === '/trace') {
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const event = JSON.parse(body) as TraceEvent;
        if (!event || typeof event !== 'object' || !event.type || !event.runId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: 'missing required fields (type, runId)',
          }));
          console.warn('[trace] 400 — malformed body:', body.slice(0, 200));
          return;
        }

        // Broadcast to every connected dashboard client.
        io.emit('trace', event);

        const connCount = io.engine?.clientsCount ?? 0;
        console.log(
          `[trace] ${event.type} runId=${event.runId}` +
            (event.stage ? ` stage=${event.stage}/${event.stageStatus ?? '-'}` : '') +
            (event.caseId ? ` case=${event.caseId}/${event.caseStatus ?? '-'}` : '') +
            (event.message ? ` msg="${truncate(event.message, 80)}"` : '') +
            ` -> ${connCount} client(s)`,
        );

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, broadcast: connCount }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
        console.warn('[trace] 400 — JSON parse error:', err);
      }
    });
    req.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
    });
    return;
  }

  // GET / — human-friendly index
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pipeline-ws — socket.io on path=/, POST /trace, GET /healthz\n');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
}

// ---- HTTP server (initial handler = router; socket.io will replace it below) ----
const httpServer = createServer(router);

// ---- socket.io server ----
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy forwards /?XTransformPort=3003 here.
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ---- Replace engine.io's blanket '/' interceptor with a smart dispatcher ----
// engine.io's attach() with path:'/' intercepts EVERY URL because all URLs
// start with '/'. Replace it with a dispatcher that recognises engine.io
// requests by their EIO/transport query params (and the /socket.io.js client
// file) and routes them to io.engine, leaving /healthz, /trace, and / for us.
httpServer.removeAllListeners('request');
httpServer.removeAllListeners('upgrade');

function isEngineIoReq(req: IncomingMessage): boolean {
  const url = req.url || '';
  // engine.io polling & websocket requests always carry EIO (and transport).
  if (/[?&]EIO=/.test(url) || /[?&]transport=/.test(url)) return true;
  // socket.io client library path (only if serveClient — false here).
  if (/^\/socket\.io(\.|\/|$)/.test(url)) return true;
  return false;
}

httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
  if (isEngineIoReq(req)) {
    io.engine.handleRequest(req, res);
    return;
  }
  router(req, res);
});

httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
  if (isEngineIoReq(req)) {
    io.engine.handleUpgrade(req, socket, head);
    return;
  }
  // No other WebSocket upgrades expected — close politely.
  socket.destroy();
});

// ---- socket.io lifecycle ----
io.on('connection', (socket: Socket) => {
  const count = io.engine?.clientsCount ?? 0;
  console.log(`[io] client connected id=${socket.id} total=${count}`);

  // Greet the new client — dashboard can use this to confirm the channel is live.
  socket.emit('hello', {
    service: 'pipeline-ws',
    port: PORT,
    time: Date.now(),
  });

  socket.on('disconnect', (reason: string) => {
    const after = io.engine?.clientsCount ?? 0;
    console.log(`[io] client disconnected id=${socket.id} reason=${reason} total=${after}`);
  });

  socket.on('error', (err: unknown) => {
    console.error(`[io] socket error id=${socket.id}:`, err);
  });
});

// ---- helpers ----
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---- boot ----
httpServer.listen(PORT, () => {
  console.log(`pipeline-ws listening on port ${PORT}`);
  console.log(`  socket.io: path=/, cors=* (dashboard: io('/?XTransformPort=3003'))`);
  console.log(`  POST /trace   <- worker trace events (broadcast on 'trace')`);
  console.log(`  GET  /healthz -> {ok:true, service, port}`);
});

// ---- graceful shutdown ----
function shutdown(signal: string): void {
  console.log(`pipeline-ws received ${signal}, shutting down...`);
  io.close(() => {
    httpServer.close(() => {
      console.log('pipeline-ws closed');
      process.exit(0);
    });
  });
  // Hard exit if graceful close stalls.
  setTimeout(() => {
    console.error('pipeline-ws: force exit after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
