/**
 * POST /api/admin/generate — 手动触发生成
 */
import { authenticateRequest } from '../../lib/auth';
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

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: `方法 ${request.method} 不允许` }), {
        status: 405, headers: corsHeaders(),
      });
    }

    if (!(await authenticateRequest(request))) {
      return new Response(JSON.stringify({ error: '未授权' }), {
        status: 401, headers: corsHeaders(),
      });
    }

    // 读取用户 prompt（仪表盘输入，可选）
    let userPrompt = '';
    try {
      const body = await request.json() as any;
      userPrompt = body?.prompt || '';
    } catch { /* 没有 body */ }

    const result = await performGenerate({ userPrompt, trigger: 'manual' });

    return new Response(JSON.stringify({
      success: true,
      text: result.text,
      mood: result.mood,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
      promptName: result.promptName,
    }), { headers: corsHeaders() });
  } catch (e: any) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message || '生成失败',
    }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}
