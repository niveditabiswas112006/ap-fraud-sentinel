// POST /api/ai/tts
// Server-side only wrapper around z-ai-web-dev-sdk TTS.
// Body: { text, voice?, case_id? }
// Saves WAV bytes to /public/calls/{case_id}.wav when case_id is provided,
// otherwise to /public/calls/tts-<short-hash>.wav.
// Returns { audio_base64, format: 'wav', path } — or { audio_base64: '', format: 'wav' } on failure
// (worker treats empty as "use deterministic fallback").

import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TTSRequestBody {
  text?: string;
  voice?: string;
  case_id?: string;
}

const VOICES = new Set([
  'tongtong',
  'chuichui',
  'xiaochen',
  'jam',
  'kazi',
  'douji',
  'luodo',
]);

function slugFromText(text: string): string {
  return (
    'tts-' +
    createHash('sha1')
      .update(text)
      .digest('hex')
      .slice(0, 10)
  );
}

export async function POST(req: Request) {
  let body: TTSRequestBody;
  try {
    body = (await req.json()) as TTSRequestBody;
  } catch {
    return NextResponse.json({ audio_base64: '', format: 'wav' }, { status: 200 });
  }

  const text = (body.text ?? '').toString().slice(0, 1024);
  if (!text) {
    return NextResponse.json({ audio_base64: '', format: 'wav' }, { status: 200 });
  }
  const voice = body.voice && VOICES.has(body.voice) ? body.voice : 'tongtong';

  // Decide the slug for the persisted file.
  const caseId = (body.case_id ?? '').toString().trim().replace(/[^A-Za-z0-9_-]/g, '');
  const slug = caseId || slugFromText(text);
  const relPath = `/calls/${slug}.wav`;
  const absPath = path.join(process.cwd(), 'public', 'calls', `${slug}.wav`);

  try {
    const ZAIModule = (await import('z-ai-web-dev-sdk')) as { default?: any };
    const ZAI = ZAIModule.default ?? (ZAIModule as any);
    const zai = await ZAI.create();

    const response = await zai.audio.tts.create({
      input: text,
      voice,
      speed: 1.0,
      response_format: 'wav',
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(new Uint8Array(arrayBuffer));
    const audio_base64 = buf.toString('base64');

    // Persist to /public/calls/<slug>.wav so the dashboard can play it back.
    const dir = path.join(process.cwd(), 'public', 'calls');
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeFile(absPath, buf).catch(() => {});

    return NextResponse.json(
      { audio_base64, format: 'wav', path: relPath },
      { status: 200 },
    );
  } catch (err) {
    console.error('[/api/ai/tts] error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ audio_base64: '', format: 'wav' }, { status: 200 });
  }
}
