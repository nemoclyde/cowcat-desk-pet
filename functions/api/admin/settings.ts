/**
 * GET/PUT /api/admin/settings — 全局设置
 * 使用 EdgeOne 标准格式：export default function onRequest
 */
import { authenticateRequest } from '../../lib/auth';
import { kvSettings, readJSON, writeJSON, initKVEnv } from '../../lib/kv';

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

function jsonError(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: corsHeaders() });
}

function getDefaultGeneral() {
  return {
    generateInterval: 10,
    weatherCity: '北京',
    maxHistoryCache: 50,
    logRetentionDays: 30,   // 已废弃，改用 maxLogCount
    maxLogCount: 100,        // 日志最大条数（默认 100）
    promptWrapper: '',       // 自定义 prompt 外包装模板，空则用默认
    defaultTaskPrompt: '',   // 默认任务指令（{{TASK}}），空则用 DEFAULT_USER_PROMPT
  };
}

function getDefaultDoubao() {
  return {
    model: 'doubao-seed-2-0-lite-260215',
    maxOutputTokens: 256,
    apiKey: '',
    disableThinking: true,
  };
}

async function handleGet(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  const general = await readJSON<any>(kvSettings, 'general') || getDefaultGeneral();
  const doubao = await readJSON<any>(kvSettings, 'doubao') || getDefaultDoubao();

  // 返回时脱敏 API Key
  if (doubao?.apiKey) {
    doubao.apiKey = '********' + doubao.apiKey.slice(-4);
  }

  return new Response(JSON.stringify({ general, doubao }), { headers: corsHeaders() });
}

async function handlePut(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  const body = await request.json() as any;

  if (body.general) {
    await writeJSON(kvSettings, 'general', body.general);
  }
  if (body.doubao) {
    if (body.doubao.apiKey === '********') {
      const existing = await readJSON<any>(kvSettings, 'doubao');
      body.doubao.apiKey = existing?.apiKey || '';
    }
    await writeJSON(kvSettings, 'doubao', body.doubao);
  }

  const general = await readJSON<any>(kvSettings, 'general');
  const doubao = await readJSON<any>(kvSettings, 'doubao');
  if (doubao?.apiKey) {
    doubao.apiKey = '********' + doubao.apiKey.slice(-4);
  }

  return new Response(JSON.stringify({ general, doubao }), { headers: corsHeaders() });
}

export default async function onRequest(context: any) {
  try {
    initKVEnv(context?.env);
    const request: Request = context?.request;
    if (!request) return jsonError('context.request 不可用');
    const method = request.method || 'GET';

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    switch (method) {
      case 'GET':
        return await handleGet(request);
      case 'PUT':
        return await handlePut(request);
      default:
        return jsonError(`方法 ${method} 不允许`, 405);
    }
  } catch (e: any) {
    return jsonError(e.message || '服务器错误');
  }
}
