// POST /api/ai/llm
// Server-side wrapper around z-ai-web-dev-sdk and Ollama (local LLM).
// Body: { system, user, max_tokens?, temperature? }
// Returns: { text } — or { text: '' } on failure.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LLMRequestBody {
  system?: string;
  user?: string;
  max_tokens?: number;
  temperature?: number;
}

export async function POST(req: Request) {
  let body: LLMRequestBody;
  try {
    body = (await req.json()) as LLMRequestBody;
  } catch {
    return NextResponse.json({ text: '' }, { status: 200 });
  }

  const system = (body.system ?? '').toString().slice(0, 8000);
  const user = (body.user ?? '').toString().slice(0, 16000);

  if (!user && !system) {
    return NextResponse.json({ text: '' }, { status: 200 });
  }

  // 1. Try local Ollama first for max speed & local reliability
  try {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const ollamaRes = await fetch(`${ollamaHost}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user },
        ],
        max_tokens: body.max_tokens ?? 250,
        temperature: body.temperature ?? 0.1,
      }),
    });

    clearTimeout(timeoutId);

    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      if (text) {
        return NextResponse.json({ text: typeof text === 'string' ? text : String(text ?? '') }, { status: 200 });
      }
    }
  } catch {
    // Continue to z-ai fallback if local Ollama fails
  }

  // 2. Try z-ai-web-dev-sdk fallback
  try {
    const ZAIModule = (await import('z-ai-web-dev-sdk')) as { default?: any };
    const ZAI = ZAIModule.default ?? (ZAIModule as any);
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: system || 'You are a helpful assistant.' },
        { role: 'user', content: user },
      ],
      thinking: { type: 'disabled' },
      max_tokens: body.max_tokens ?? 250,
    });

    const text: string =
      completion?.choices?.[0]?.message?.content ??
      completion?.choices?.[0]?.text ??
      '';

    if (text) {
      return NextResponse.json({ text: typeof text === 'string' ? text : String(text ?? '') }, { status: 200 });
    }
  } catch {
    // Return empty fallback gracefully
  }

  return NextResponse.json({ text: '' }, { status: 200 });
}

