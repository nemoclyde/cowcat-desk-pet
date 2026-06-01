/**
 * CRUD /api/admin/prompts — 提示词管理
 * 使用 EdgeOne 标准格式：export default function onRequest
 */
import { authenticateRequest } from '../../lib/auth';
import { kvPrompts, readJSONCompat, writeJSON, listKeysCompat, deleteCompat, generateId, initKVEnv, promptKey, KEY_PREFIX } from '../../lib/kv';

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
  const match = pathname.match(/\/api\/admin\/prompts\/(.+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleGet(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  const keys = await listKeysCompat(kvPrompts, KEY_PREFIX.PROMPT, 100);
  const results = await Promise.all(keys.map(k => readJSONCompat<any>(kvPrompts, k).catch(() => null)));
  const prompts = results.filter((p): p is any => p != null);
  prompts.sort((a: any, b: any) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));

  return new Response(JSON.stringify(prompts), { headers: corsHeaders() });
}

async function handlePost(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  const body = await request.json() as any;
  const id = generateId();
  const prompt = {
    id,
    name: body.name || '未命名',
    systemPrompt: body.systemPrompt || '',
    userPromptTemplate: body.userPromptTemplate || '',
    temperature: body.temperature ?? 0.9,
    maxTokens: body.maxTokens || 512,
    isActive: body.isActive ?? false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeJSON(kvPrompts, promptKey(id), prompt);
  return new Response(JSON.stringify(prompt), { status: 201, headers: corsHeaders() });
}

async function handlePut(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  // 优先从 query string 取 id，兼容旧 URL 路径格式
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || extractId(url.pathname);
  if (!id) return jsonError('缺少 ID', 400);

  const key = promptKey(id);
  const existing = await readJSONCompat<any>(kvPrompts, key);
  if (!existing) return jsonError('提示词不存在', 404);

  const body = await request.json() as any;
  const updated = {
    ...existing,
    name: body.name ?? existing.name,
    systemPrompt: body.systemPrompt ?? existing.systemPrompt,
    userPromptTemplate: body.userPromptTemplate ?? existing.userPromptTemplate,
    temperature: body.temperature ?? existing.temperature,
    maxTokens: body.maxTokens ?? existing.maxTokens,
    isActive: body.isActive ?? existing.isActive,
    updatedAt: new Date().toISOString(),
  };

  await writeJSON(kvPrompts, key, updated);
  return new Response(JSON.stringify(updated), { headers: corsHeaders() });
}

async function handleDelete(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  // 优先从 query string 取 id，兼容旧 URL 路径格式
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || extractId(url.pathname);
  if (!id) return jsonError('缺少 ID', 400);

  await deleteCompat(kvPrompts, promptKey(id));
  return new Response(JSON.stringify({ success: true }), { headers: corsHeaders() });
}

// EdgeOne 标准格式：单一 default export，内部根据 method 分发
export default async function onRequest(context: any) {
  try {
    initKVEnv(context?.env);
    const request: Request = context?.request;
    if (!request) return jsonError('context.request 不可用');
    const method = request.method || 'GET';

    // CORS preflight
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
    return jsonError(e.message || '服务器错误');
  }
}
