/**
 * POST /api/internal/generate — SCF 定时触发
 */
import { initKVEnv } from '../../lib/kv';
import { performGenerate } from '../../lib/cat-generate';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export default async function onRequest(context: any) {
  try {
    initKVEnv(context?.env);
    const request: Request = context?.request;
    if (!request) {
      return new Response(JSON.stringify({ error: 'context.request 不可用' }), {
        status: 500, headers: corsHeaders(),
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const result = await performGenerate({ trigger: 'scheduled' });

    return new Response(JSON.stringify({
      success: true,
      text: result.text,
      mood: result.mood,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
      promptName: result.promptName,
    }), { headers: corsHeaders() });
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || '生成失败',
    }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}
