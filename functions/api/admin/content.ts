/**
 * GET/PUT /api/admin/content — 可编辑内容管理
 */
import { readContent, writeContent, initKVEnv } from '../lib/kv';
import { DEFAULT_CONTENT } from '../lib/content-defs';
import { authenticateRequest } from '../../lib/auth';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function requireAuth(request: Request) {
  if (!(await authenticateRequest(request))) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: corsHeaders() });
  }
  return null;
}

export default async function onRequest(context: any) {
  try {
    initKVEnv(context?.env);
    const request: Request = context?.request;
    if (!request) {
      return new Response(JSON.stringify({ error: 'context.request 不可用' }), { status: 500, headers: corsHeaders() });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method === 'GET') {
      const authErr = await requireAuth(request);
      if (authErr) return authErr;

      const content = await readContent();
      return new Response(JSON.stringify({ content, defaults: DEFAULT_CONTENT }), { headers: corsHeaders() });
    }

    if (request.method === 'PUT') {
      const authErr = await requireAuth(request);
      if (authErr) return authErr;

      const body: any = await request.json();
      if (!body.content || typeof body.content !== 'object') {
        return new Response(JSON.stringify({ error: '缺少 content 字段' }), { status: 400, headers: corsHeaders() });
      }
      await writeContent(body.content);
      const content = await readContent();
      return new Response(JSON.stringify({ success: true, content }), { headers: corsHeaders() });
    }

    return new Response(JSON.stringify({ error: `方法 ${request.method} 不允许` }), { status: 405, headers: corsHeaders() });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: '服务器错误', detail: err.message }), { status: 500, headers: corsHeaders() });
  }
}
