/**
 * PUT /api/admin/password — 修改密码
 * 使用 EdgeOne 标准格式：export default function onRequest
 */
import { authenticateRequest, hashPassword, verifyPassword } from '../../lib/auth';
import { kvSettings, readJSON, writeJSON, initKVEnv } from '../../lib/kv';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), { headers: corsHeaders() });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: corsHeaders() });
}

async function handlePut(request: Request) {
  const authed = await authenticateRequest(request);
  if (!authed) return jsonError('未授权', 401);

  const body = await request.json() as { oldPassword: string; newPassword: string };
  const { oldPassword, newPassword } = body;

  if (!oldPassword || !newPassword) return jsonError('请提供旧密码和新密码', 400);
  if (newPassword.length < 4) return jsonError('新密码至少4位', 400);

  const authData = await readJSON<{ passwordHash: string }>(kvSettings, 'auth');
  if (authData?.passwordHash) {
    const valid = await verifyPassword(oldPassword, authData.passwordHash);
    if (!valid) return jsonError('旧密码错误', 403);
  }

  const newHash = await hashPassword(newPassword);
  await writeJSON(kvSettings, 'auth', { passwordHash: newHash });

  return jsonResponse({ success: true, message: '密码修改成功' });
}

export default async function onRequest(context: any) {
  try {
    initKVEnv(context?.env);
    const request: Request = context?.request;
    if (!request) return jsonError('context.request 不可用', 500);
    const method = request.method || 'GET';

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    switch (method) {
      case 'PUT':
        return await handlePut(request);
      default:
        return jsonError(`方法 ${method} 不允许`, 405);
    }
  } catch (e: any) {
    return jsonError(e.message || '修改失败', 500);
  }
}
