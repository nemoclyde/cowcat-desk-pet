/**
 * GET /api/admin/logs — 日志查询 + 导出
 * 使用 EdgeOne 标准格式：export default function onRequest
 */
import { authenticateRequest } from '../../lib/auth';
import { kvLogs, readJSONCompat, listKeysCompat, initKVEnv, KEY_PREFIX } from '../../lib/kv';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

/**
 * 判断日志 key 是否匹配过滤条件（key 格式: log_YYYYMMDDHHmmss_id）
 * 在读取条目内容之前先按 key 名过滤，大幅减少 KV 读取次数
 */
function keyMatchesFilter(key: string, trigger: string, mood: string, dateFrom: string, dateTo: string): boolean {
  // 日期过滤：key 前缀 log_YYYYMMDD
  if (dateFrom || dateTo) {
    const tsPart = key.slice(4, 12); // YYYYMMDD
    if (dateFrom && tsPart < dateFrom.replace(/-/g, '')) return false;
    if (dateTo && tsPart > dateTo.replace(/-/g, '')) return false;
  }
  // trigger/mood 无法按 key 过滤，需读取后判断
  return true;
}

async function handleGet(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const path = url.pathname;
  const isExport = path.endsWith('/export');

  const trigger = url.searchParams.get('trigger') || '';
  const mood = url.searchParams.get('mood') || '';
  const dateFrom = url.searchParams.get('dateFrom') || '';
  const dateTo = url.searchParams.get('dateTo') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20');

  // 步骤 1：只列 key 名（轻量操作，不读取内容）
  const allKeys = await listKeysCompat(kvLogs, KEY_PREFIX.LOG, 200);

  // 步骤 2：按日期预过滤 key（避免读取不相关条目）
  const needContentFilter = !!(trigger || mood);
  const candidateKeys = needContentFilter
    ? allKeys
    : allKeys.filter(k => keyMatchesFilter(k, trigger, mood, dateFrom, dateTo));

  // 步骤 3：排序（字母序 = 时间序），取当前页需要的 key
  candidateKeys.sort().reverse(); // 最新在前
  const total = candidateKeys.length;

  if (isExport) {
    // 导出：需要全部内容
    const results = await Promise.all(candidateKeys.map(k => readJSONCompat<any>(kvLogs, k).catch(() => null)));
    const filtered = results.filter((l): l is any => {
      if (!l) return false;
      if (trigger && l.trigger !== trigger) return false;
      if (mood && l.output?.mood !== mood) return false;
      return true;
    });

    const format = url.searchParams.get('format') || 'json';
    if (format === 'csv') {
      const csvHeaders = '时间,触发方式,心情,说的话,Token用量,延迟(ms)\n';
      const csvRows = filtered.map((l: any) =>
        `"${l.timestamp}","${l.trigger}","${l.output?.mood || ''}","${(l.output?.text || '').replace(/"/g, '""')}","${l.output?.tokensUsed || 0}","${l.output?.latencyMs || 0}"`
      ).join('\n');
      return new Response(csvHeaders + csvRows, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="cowcat-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    return new Response(JSON.stringify(filtered, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="cowcat-logs-${new Date().toISOString().slice(0, 10)}.json"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 分页模式：只读取当前页需要的条目（最多 pageSize 条，而不是 200 条）
  const start = (page - 1) * pageSize;
  const pageKeys = candidateKeys.slice(start, start + pageSize);
  const results = await Promise.all(pageKeys.map(k => readJSONCompat<any>(kvLogs, k).catch(() => null)));
  let items = results.filter((l): l is any => l != null);

  // 如果 trigger/mood 过滤，在已读取的条目中过滤，但 total 已不准确（只读了当前页）
  if (needContentFilter) {
    items = items.filter((l: any) => {
      if (trigger && l.trigger !== trigger) return false;
      if (mood && l.output?.mood !== mood) return false;
      return true;
    });
  }

  return new Response(JSON.stringify({ items, total, page, pageSize }), { headers: corsHeaders() });
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
      default:
        return jsonError(`方法 ${method} 不允许`, 405);
    }
  } catch (e: any) {
    return jsonError(e.message || '服务器错误');
  }
}
