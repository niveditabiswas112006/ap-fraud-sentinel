// POST /api/ai/asr
// Server-side only wrapper around z-ai-web-dev-sdk ASR.
// Body: { audio_base64, format? }
// Returns: { text } — or { text: '' } on failure (worker falls back to deterministic transcript).

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ASRRequestBody {
  audio_base64?: string;
  format?: string;
}

export async function POST(req: Request) {
  let body: ASRRequestBody;
  try {
    body = (await req.json()) as ASRRequestBody;
  } catch {
    return NextResponse.json({ text: '' }, { status: 200 });
  }

  const audio_base64 = (body.audio_base64 ?? '').toString().trim();
  if (!audio_base64) {
    return NextResponse.json({ text: '' }, { status: 200 });
  }

  try {
    const ZAIModule = (await import('z-ai-web-dev-sdk')) as { default?: any };
    const ZAI = ZAIModule.default ?? (ZAIModule as any);
    const zai = await ZAI.create();

    const response = await zai.audio.asr.create({
      file_base64: audio_base64,
    });

    const text: string = response?.text ?? '';
    return NextResponse.json({ text: typeof text === 'string' ? text : String(text ?? '') }, { status: 200 });
  } catch (err) {
    console.error('[/api/ai/asr] error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ text: '' }, { status: 200 });
  }
}
