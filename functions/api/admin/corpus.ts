/**
 * CRUD /api/admin/corpus — 语料库管理
 * 使用 EdgeOne 标准格式：export default function onRequest
 */
import { authenticateRequest } from '../../lib/auth';
import { kvCorpus, readJSONCompat, writeJSON, listKeysCompat, deleteCompat, generateId, initKVEnv, corpusKey, KEY_PREFIX } from '../../lib/kv';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function requireAuth(request: Request) {
  if (!(await authenticateRequest(request))) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers: corsHeaders() });
  }
  return null;
}

function jsonError(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: corsHeaders() });
}

function extractId(pathname: string): string | null {
  const match = pathname.match(/\/api\/admin\/corpus\/(.+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleGet(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const category = url.searchParams.get('category') || '';
  const keyword = url.searchParams.get('keyword') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '50');

  const keys = await listKeysCompat(kvCorpus, KEY_PREFIX.CORPUS, 200);
  const results = await Promise.all(keys.map(k => readJSONCompat<any>(kvCorpus, k).catch(() => null)));
  const allEntries = results.filter((e): e is any => e != null);

  let filtered = allEntries;
  if (category) filtered = filtered.filter((e: any) => e.category === category);
  if (keyword) {
    const kw = keyword.toLowerCase();
    filtered = filtered.filter((e: any) =>
      e.content.toLowerCase().includes(kw) ||
      (e.keywords || []).some((k: string) => k.toLowerCase().includes(kw))
    );
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return new Response(JSON.stringify({ items, total, page, pageSize }), { headers: corsHeaders() });
}

async function handlePost(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  const body = await request.json() as any;

  if (body.batch && Array.isArray(body.items)) {
    const items = body.items;
    const created = [];
    for (const item of items) {
      const id = generateId();
      const entry = {
        id,
        category: item.category || '日常',
        content: item.content || '',
        keywords: item.keywords || [],
        weight: item.weight || 1,
        createdAt: new Date().toISOString(),
      };
      const key = corpusKey(id);
      await writeJSON(kvCorpus, key, entry);
      created.push(entry);
    }
    return new Response(JSON.stringify({ success: true, count: created.length }), { status: 201, headers: corsHeaders() });
  }

  const id = generateId();
  const entry = {
    id,
    category: body.category || '日常',
    content: body.content || '',
    keywords: body.keywords || [],
    weight: body.weight || 1,
    createdAt: new Date().toISOString(),
  };

  await writeJSON(kvCorpus, corpusKey(id), entry);
  return new Response(JSON.stringify(entry), { status: 201, headers: corsHeaders() });
}

async function handlePut(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  // 优先从 query string 取 id，兼容旧 URL 路径格式
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || extractId(url.pathname);
  if (!id) return jsonError('缺少 ID', 400);

  const key = corpusKey(id);
  const existing = await readJSONCompat<any>(kvCorpus, key);
  if (!existing) return jsonError('语料不存在', 404);

  const body = await request.json() as any;
  const updated = {
    ...existing,
    category: body.category ?? existing.category,
    content: body.content ?? existing.content,
    keywords: body.keywords ?? existing.keywords,
    weight: body.weight ?? existing.weight,
    updatedAt: new Date().toISOString(),
  };

  await writeJSON(kvCorpus, key, updated);
  return new Response(JSON.stringify(updated), { headers: corsHeaders() });
}

async function handleDelete(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  // 优先从 query string 取 id，兼容旧 URL 路径格式
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || extractId(url.pathname);
  if (!id) return jsonError('缺少 ID', 400);

  await deleteCompat(kvCorpus, corpusKey(id));
  return new Response(JSON.stringify({ success: true }), { headers: corsHeaders() });
}

export default async function onRequest(context: any) {
  try {
    initKVEnv(context?.env);
    const request: Request = context?.request;
    if (!request) {
      return new Response(JSON.stringify({ error: 'context.request 不可用' }), {
        status: 500,
        headers: corsHeaders(),
      });
    }

    const method = request.method || 'GET';

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    switch (method) {
      case 'GET':
        return await handleGet(request);
      case 'POST':
        return await handlePost(request);
      case 'PUT':
        return await handlePut(request);
      case 'DELETE':
        return await handleDelete(request);
      default:
        return jsonError(`方法 ${method} 不允许`, 405);
    }
  } catch (e: any) {
    return new Response(JSON.stringify({
      error: e.message || '服务器错误',
      stack: e.stack?.slice(0, 500),
    }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}
