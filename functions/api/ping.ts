/**
 * GET /api/ping — 最简健康检查
 * EdgeOne 标准格式：export default function onRequest
 */

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
    const request: Request = context?.request;
    if (!request) {
      return new Response(JSON.stringify({ ok: false, error: 'context.request 不可用' }), {
        status: 500, headers: corsHeaders(),
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    return new Response(JSON.stringify({ ok: true, time: new Date().toISOString() }), {
      headers: corsHeaders(),
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: corsHeaders(),
    });
  }
}
