/**
 * GET /api/admin/test-crud — 最简 CRUD 测试
 * EdgeOne 标准格式：export default function onRequest
 * 测试 admin 子目录下的函数是否能被 EdgeOne 正确加载
 */
import { authenticateRequest } from '../../lib/auth';
import { kvSettings, readJSON, initKVEnv } from '../../lib/kv';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

    // 测试 auth
    const authed = await authenticateRequest(request);
    // 测试 kv
    const settings = await readJSON(kvSettings, 'general');
    return new Response(JSON.stringify({
      ok: true,
      authed,
      hasSettings: settings !== null,
    }), { headers: corsHeaders() });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}
