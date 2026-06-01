/**
 * GET /api/speak — 对外公开 API
 * 始终毫秒级响应：直接返回缓存，绝不阻塞等待生成。
 * 缓存过期时，背景异步刷新（EdgeOne: ctx.waitUntil / 本地: fire-and-forget）。
 * EdgeOne 标准格式：export default function onRequest
 */

import { kvCache, readJSON, initKVEnv } from '../lib/kv';
import { isCacheStale, performGenerate } from '../lib/cat-generate';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache',
  };
}

// 防止并发 bgRefresh 互相覆盖缓存
let _bgRefreshing = false;

function bgRefresh(context: any) {
  if (_bgRefreshing) return; // 已有刷新在进行中，跳过
  _bgRefreshing = true;
  const p = performGenerate({ trigger: 'auto', env: context?.env })
    .catch(() => {})
    .finally(() => { _bgRefreshing = false; });
  // EdgeOne / Cloudflare Workers: 用 waitUntil 保持函数存活直到生成完成
  const waitUntil = context?.waitUntil || context?.ctx?.waitUntil;
  if (typeof waitUntil === 'function') {
    waitUntil(p);
  }
  // 本地环境：fire-and-forget（Node.js 进程不退出就会继续执行）
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

    // 读取当前缓存
    const cached = await readJSON<{
      text: string;
      mood: string;
      generatedAt: string;
      context: Record<string, any>;
    }>(kvCache, 'current');

    const hasCache = !!(cached && cached.text);
    // 传入已读取的 cached 对象，避免 isCacheStale 内部再读一次 KV
    const stale = await isCacheStale(cached);

    // 缓存新鲜 → 直接返回
    if (hasCache && !stale) {
      return new Response(JSON.stringify({
        text: cached.text,
        mood: cached.mood,
        generatedAt: cached.generatedAt,
        context: cached.context,
      }), { headers: corsHeaders() });
    }

    // 缓存过期 → 先返回旧缓存，背景刷新
    if (hasCache && stale) {
      bgRefresh(context);
      return new Response(JSON.stringify({
        text: cached.text,
        mood: cached.mood,
        generatedAt: cached.generatedAt,
        context: { ...cached.context, refreshing: true },
      }), { headers: corsHeaders() });
    }

    // 无缓存 → 返回默认文本，背景生成（首次调用不会卡）
    bgRefresh(context);
    const { readContent } = await import('../lib/kv');
    const ct = await readContent().catch(() => null);
    return new Response(JSON.stringify({
      text: ct?.fallback_noSpeakCache || '喵~ 本喵刚睡醒，还没想好要说什么... 等下再问我吧！',
      mood: '慵懒',
      generatedAt: new Date().toISOString(),
      context: { init: true },
      cached: false,
    }), { headers: corsHeaders() });

  } catch (err: any) {
    return new Response(JSON.stringify({
      text: '喵？出错了...本喵也不知道发生了什么喵...',
      error: err.message,
    }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}
