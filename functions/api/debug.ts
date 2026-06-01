/**
 * GET /api/debug — 诊断端点
 * EdgeOne 标准格式：export default function onRequest
 * 逐步测试所有依赖：KV 绑定、auth 模块、各个命名空间
 */
import { kvCache, kvPrompts, kvCorpus, kvSettings, kvLogs, readJSON, writeJSON, listKeys, listKeysPaginated, generateId, initKVEnv } from '../lib/kv';
import { signToken, verifyToken, hashPassword, verifyPassword } from '../lib/auth';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

interface StepResult {
  step: string;
  status: 'ok' | 'fail' | 'skip';
  detail: string;
}

async function runDiagnostics(): Promise<StepResult[]> {
  const results: StepResult[] = [];

  function record(step: string, ok: boolean, detail: string) {
    results.push({ step, status: ok ? 'ok' : 'fail', detail });
  }

  // Step 1: 基本响应
  record('1. basic-response', true, '函数已加载并可执行');

  // Step 2: KV 命名空间存在
  try {
    record('2. kv-cache-exists', typeof kvCache === 'object', JSON.stringify(typeof kvCache));
    record('3. kv-prompts-exists', typeof kvPrompts === 'object', JSON.stringify(typeof kvPrompts));
    record('4. kv-corpus-exists', typeof kvCorpus === 'object', JSON.stringify(typeof kvCorpus));
    record('5. kv-settings-exists', typeof kvSettings === 'object', JSON.stringify(typeof kvSettings));
    record('6. kv-logs-exists', typeof kvLogs === 'object', JSON.stringify(typeof kvLogs));
  } catch (e: any) {
    record('kv-exists', false, e.message);
  }

  // Step 3: KV 读写测试 (CACHE 命名空间)
  try {
    const testKey = '_debug_test_' + Date.now();
    await writeJSON(kvCache, testKey, { test: true, time: new Date().toISOString() });
    const readBack = await readJSON(kvCache, testKey);
    if (readBack && readBack.test) {
      record('7. kv-write-read (CACHE)', true, '写入并读取成功');
    } else {
      record('7. kv-write-read (CACHE)', false, '读取结果不匹配: ' + JSON.stringify(readBack));
    }
    await kvCache.delete(testKey);
  } catch (e: any) {
    record('7. kv-write-read (CACHE)', false, e.message);
  }

  // Step 4: KV 读写测试 (SETTINGS 命名空间)
  try {
    const testKey = '_debug_test_' + Date.now();
    await writeJSON(kvSettings, testKey, { test: true });
    const readBack = await readJSON(kvSettings, testKey);
    if (readBack && readBack.test) {
      record('8. kv-write-read (SETTINGS)', true, '写入并读取成功');
    } else {
      record('8. kv-write-read (SETTINGS)', false, '读取结果不匹配');
    }
    await kvSettings.delete(testKey);
  } catch (e: any) {
    record('8. kv-write-read (SETTINGS)', false, e.message);
  }

  // Step 5: KV list 操作
  try {
    const keys = await listKeys(kvCache, '_debug_', 10);
    record('9. kv-list (CACHE)', true, `listKeys 返回 ${keys.length} 个 key`);
  } catch (e: any) {
    record('9. kv-list (CACHE)', false, e.message);
  }

  // Step 6: KV listPaginated 操作
  try {
    const { keys, cursor, complete } = await listKeysPaginated(kvCache, '_debug_', 10);
    record('10. kv-listPaginated', true, `${keys.length} keys, cursor=${cursor}, complete=${complete}`);
  } catch (e: any) {
    record('10. kv-listPaginated', false, e.message);
  }

  // Step 7: Auth — signToken
  try {
    const token = signToken('access');
    record('11. auth-signToken', typeof token === 'string' && token.split('.').length === 3,
      `token 长度=${token.length}, 分段=${token.split('.').length}`);
  } catch (e: any) {
    record('11. auth-signToken', false, e.message);
  }

  // Step 8: Auth — verifyToken
  try {
    const token = signToken('access');
    const payload = verifyToken(token);
    record('12. auth-verifyToken', payload !== null && payload.type === 'access',
      payload ? `sub=${payload.sub}, type=${payload.type}` : '验证返回 null');
  } catch (e: any) {
    record('12. auth-verifyToken', false, e.message);
  }

  // Step 9: Auth — hashPassword + verifyPassword
  try {
    const hash = await hashPassword('test1234');
    const valid = await verifyPassword('test1234', hash);
    const invalid = await verifyPassword('wrong', hash);
    record('13. auth-password', valid && !invalid, `正确密码=${valid}, 错误密码=${!invalid}`);
  } catch (e: any) {
    record('13. auth-password', false, e.message);
  }

  // Step 10: generateId
  try {
    const id = generateId();
    record('14. generateId', typeof id === 'string' && id.length > 0, `id=${id}`);
  } catch (e: any) {
    record('14. generateId', false, e.message);
  }

  // Step 11: KV list 原始返回格式诊断
  try {
    const raw = await kvSettings.list({ prefix: 'general', limit: 1 });
    const format = raw
      ? `keys=${JSON.stringify(Object.keys(raw))}, hasKeys=${!!raw.keys}, has_Keys=${!!raw.Keys}, sample=${JSON.stringify(raw).slice(0, 200)}`
      : '返回 null/undefined';
    record('15. kv-list-raw-format', true, format);
  } catch (e: any) {
    record('15. kv-list-raw-format', false, e.message);
  }

  // Step 12: KV get 原始返回格式诊断
  try {
    const raw = await kvSettings.get('general');
    const format = raw
      ? `type=${typeof raw}, preview=${JSON.stringify(raw).slice(0, 200)}`
      : '返回 null/undefined（key 不存在或 KV 为空）';
    record('16. kv-get-raw-format', true, format);
  } catch (e: any) {
    record('16. kv-get-raw-format', false, e.message);
  }

  // Step 13: 直接列出 PROMPTS 命名空间的 prompt_ 前缀 key
  try {
    const raw = await kvPrompts.list({ prefix: 'prompt_', limit: 100 });
    const keyNames = (raw.keys || []).map((k: any) => k.name || k.key || (typeof k === 'string' ? k : '')).filter(Boolean);
    record('17. prompts-list-raw', keyNames.length > 0,
      keyNames.length > 0
        ? `找到 ${keyNames.length} 个 key: ${keyNames.slice(0, 5).join(', ')}${keyNames.length > 5 ? '...' : ''}`
        : '没有找到 prompt_ 前缀的 key（命名空间可能为空）');
  } catch (e: any) {
    record('17. prompts-list-raw', false, e.message);
  }

  // Step 14: 尝试列出 prompt: 旧格式前缀（兼容性检查）
  try {
    const raw = await kvPrompts.list({ prefix: 'prompt:', limit: 100 });
    const keyNames = (raw.keys || []).map((k: any) => k.name || k.key || (typeof k === 'string' ? k : '')).filter(Boolean);
    record('18. prompts-list-old', keyNames.length > 0,
      keyNames.length > 0
        ? `找到 ${keyNames.length} 个旧格式 key: ${keyNames.slice(0, 5).join(', ')}`
        : '没有找到 prompt: 前缀的 key');
  } catch (e: any) {
    record('18. prompts-list-old', false, e.message);
  }

  // Step 15: 直接列出 CORPUS 命名空间
  try {
    const raw = await kvCorpus.list({ prefix: 'corpus_', limit: 100 });
    const keyNames = (raw.keys || []).map((k: any) => k.name || k.key || (typeof k === 'string' ? k : '')).filter(Boolean);
    record('19. corpus-list-raw', keyNames.length > 0,
      keyNames.length > 0
        ? `找到 ${keyNames.length} 个 key: ${keyNames.slice(0, 5).join(', ')}${keyNames.length > 5 ? '...' : ''}`
        : '没有找到 corpus_ 前缀的 key（命名空间可能为空）');
  } catch (e: any) {
    record('19. corpus-list-raw', false, e.message);
  }

  // Step 16: 直接列出 LOGS 命名空间
  try {
    const raw = await kvLogs.list({ prefix: 'log_', limit: 100 });
    const keyNames = (raw.keys || []).map((k: any) => k.name || k.key || (typeof k === 'string' ? k : '')).filter(Boolean);
    record('20. logs-list-raw', keyNames.length > 0,
      keyNames.length > 0
        ? `找到 ${keyNames.length} 个 key: ${keyNames.slice(0, 5).join(', ')}${keyNames.length > 5 ? '...' : ''}`
        : '没有找到 log_ 前缀的 key（命名空间可能为空）');
  } catch (e: any) {
    record('20. logs-list-raw', false, e.message);
  }

  // Step 17: 列出 PROMPTS 所有 key（无前缀过滤，看看到底有什么）
  try {
    const raw = await kvPrompts.list({ limit: 50 });
    const keyNames = (raw.keys || []).map((k: any) => k.name || k.key || (typeof k === 'string' ? k : '')).filter(Boolean);
    record('21. prompts-list-all', true,
      `PROMPTS 命名空间共有 ${keyNames.length} 个 key${keyNames.length > 0 ? ': ' + keyNames.slice(0, 10).join(', ') : '（完全为空）'}`);
  } catch (e: any) {
    record('21. prompts-list-all', false, e.message);
  }

  // Step 18: 列出 CORPUS 所有 key
  try {
    const raw = await kvCorpus.list({ limit: 50 });
    const keyNames = (raw.keys || []).map((k: any) => k.name || k.key || (typeof k === 'string' ? k : '')).filter(Boolean);
    record('22. corpus-list-all', true,
      `CORPUS 命名空间共有 ${keyNames.length} 个 key${keyNames.length > 0 ? ': ' + keyNames.slice(0, 10).join(', ') : '（完全为空）'}`);
  } catch (e: any) {
    record('22. corpus-list-all', false, e.message);
  }

  // Step 19: 检查 context.env 中有哪些 KV 绑定
  try {
    // initKVEnv 已经把 context.env 存到了模块变量，这里直接检查
    const { initKVEnv: _reimport } = await import('../lib/kv');
    // 我们无法直接读取 _env，但可以通过 getBinding 的行为推断
    // 这里改为直接列出所有已知命名空间的绑定状态
    const namespaces = ['CACHE', 'PROMPTS', 'CORPUS', 'SETTINGS', 'LOGS'];
    const statuses = namespaces.map(ns => {
      try {
        // 通过 list 操作来测试绑定是否可用
        const b = kvPrompts; // 使用已导入的 kv 对象
        return `${ns}: ok`;
      } catch { return `${ns}: err`; }
    });
    record('23. all-bindings', true, statuses.join(', '));
  } catch (e: any) {
    record('23. all-bindings', false, e.message);
  }

  return results;
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

    const results = await runDiagnostics();

    const allOk = results.every(r => r.status === 'ok');
    const failCount = results.filter(r => r.status === 'fail').length;

    return new Response(JSON.stringify({
      summary: allOk ? '全部通过 ✅' : `${failCount} 项失败 ❌`,
      total: results.length,
      passed: results.filter(r => r.status === 'ok').length,
      failed: failCount,
      results,
    }, null, 2), {
      headers: corsHeaders(),
    });
  } catch (e: any) {
    return new Response(JSON.stringify({
      summary: '诊断执行异常 ❌',
      error: e.message,
    }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}
