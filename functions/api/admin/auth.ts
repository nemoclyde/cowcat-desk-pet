/**
 * POST /api/admin/auth — 登录 / 刷新 token
 * 使用 EdgeOne 标准格式：export default function onRequest
 */
import { signToken, verifyToken, verifyPassword, hashPassword } from '../../lib/auth';
import { kvSettings, readJSON, writeJSON, initKVEnv } from '../../lib/kv';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), { headers: corsHeaders() });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: corsHeaders() });
}

async function handlePost(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const body = await request.json() as Record<string, string>;

  // 刷新 token
  if (path.endsWith('/refresh')) {
    const { refreshToken } = body;
    if (!refreshToken) return jsonError('缺少 refreshToken', 400);

    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== 'refresh') {
      return jsonError('refreshToken 无效或已过期', 401);
    }

    const newAccessToken = signToken('access');
    const newRefreshToken = signToken('refresh');
    return jsonResponse({ token: newAccessToken, refreshToken: newRefreshToken });
  }

  // 登录
  const { password } = body;
  if (!password) return jsonError('请输入密码', 400);

  // @ts-ignore
  const defaultPassword = typeof DEFAULT_ADMIN_PASSWORD !== 'undefined'
    // @ts-ignore
    ? DEFAULT_ADMIN_PASSWORD
    : 'admin123';

  const authData = await readJSON<{ passwordHash: string }>(kvSettings, 'auth');

  if (authData?.passwordHash) {
    const valid = await verifyPassword(password, authData.passwordHash);
    if (!valid) {
      if (password === defaultPassword) {
        const hash = await hashPassword(password);
        await writeJSON(kvSettings, 'auth', { passwordHash: hash });
      } else {
        return jsonError('密码错误', 401);
      }
    }
  } else {
    if (password === defaultPassword) {
      const hash = await hashPassword(password);
      await writeJSON(kvSettings, 'auth', { passwordHash: hash });
    } else {
      return jsonError('密码错误', 401);
    }
  }

  const token = signToken('access');
  const refreshToken = signToken('refresh');
  return jsonResponse({ token, refreshToken });
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
      case 'POST':
        return await handlePost(request);
      default:
        return jsonError(`方法 ${method} 不允许`, 405);
    }
  } catch (e: any) {
    return jsonError(e.message || '登录失败', 500);
  }
}
