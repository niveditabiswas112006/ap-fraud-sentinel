// POST /api/ai/llm
// Server-side only wrapper around z-ai-web-dev-sdk chat completions.
// Body: { system, user, max_tokens?, temperature? }
// Returns: { text } — or { text: '' } on failure (worker treats empty as "use deterministic fallback").
// NEVER import z-ai-web-dev-sdk into client code.

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

  try {
    // Dynamic import keeps z-ai-web-dev-sdk out of any client bundle.
    const ZAIModule = (await import('z-ai-web-dev-sdk')) as { default?: any };
    const ZAI = ZAIModule.default ?? (ZAIModule as any);
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: system || 'You are a helpful assistant.' },
        { role: 'user', content: user },
      ],
      thinking: { type: 'disabled' },
      ...(typeof body.max_tokens === 'number' && body.max_tokens > 0
        ? { max_tokens: body.max_tokens }
        : {}),
      ...(typeof body.temperature === 'number'
        ? { temperature: body.temperature }
        : {}),
    });

    const text: string =
      completion?.choices?.[0]?.message?.content ??
      completion?.choices?.[0]?.text ??
      '';

    return NextResponse.json({ text: typeof text === 'string' ? text : String(text ?? '') }, { status: 200 });
  } catch (err) {
    console.error('[/api/ai/llm] error:', err instanceof Error ? err.message : String(err));
    // Worker treats empty string as "use deterministic fallback".
    return NextResponse.json({ text: '' }, { status: 200 });
  }
}
