/**
 * KV 存储抽象层
 * EdgeOne Pages KV 绑定通过 context.env 注入
 * 每个 onRequest 调用 initKVEnv(context.env) 注入绑定
 *
 * 注意：不使用 Proxy（EdgeOne 运行时可能不支持），改用 getter 模式
 */

// ---- 类型 ----

interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<any>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, string> }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; metadata?: Record<string, string> }>;
    list_complete: boolean; cursor?: string;
  }>;
}

// ---- 绑定管理 ----

let _env: Record<string, any> | null = null;

/** 每个请求开始时调用 */
export function initKVEnv(env: any) {
  if (env && typeof env === 'object') {
    _env = env;
  }
}

/** 记录哪些 namespace 已经警告过回退到 mock */
const _mockWarned = new Set<string>();

/** 获取真实 KV binding（不创建 mock） */
function getBinding(namespace: string): KVNamespace | null {
  // 1. context.env（EdgeOne 标准方式）
  //    注意：EdgeOne 的 KV 绑定可能是 Proxy 对象，typeof .get 可能返回 'object' 而非 'function'
  //    因此改为检查 .get 属性是否存在（truthy），而不是严格的 typeof === 'function'
  if (_env && _env[namespace] && _env[namespace].get) {
    return _env[namespace] as KVNamespace;
  }
  // 2. globalThis（Cloudflare Workers / 某些 EdgeOne 版本）
  try {
    const g = (globalThis as any)[namespace];
    if (g && g.get) return g as KVNamespace;
  } catch {}
  // KV 绑定不可用，回退到内存存储（数据不会持久化！）
  if (!_mockWarned.has(namespace)) {
    _mockWarned.add(namespace);
    console.warn(`[KV] ⚠️ 命名空间 "${namespace}" 的 KV 绑定不可用，回退到内存存储（数据不会跨请求持久化）。请检查 EdgeOne 控制台的 KV 绑定配置。`);
  }
  return null;
}

/** 共享内存 mock（本地开发降级，同请求内持久化） */
const _mockStores = new Map<string, Map<string, string>>();

function getMockStore(namespace: string): KVNamespace {
  const prefix = namespace + ':';
  if (!_mockStores.has(namespace)) _mockStores.set(namespace, new Map());
  const store = _mockStores.get(namespace)!;

  return {
    async get(key: string) {
      const v = store.get(prefix + key);
      return v ?? null;
    },
    async put(key: string, value: string) {
      store.set(prefix + key, value);
    },
    async delete(key: string) {
      store.delete(prefix + key);
    },
    async list(options?: { prefix?: string; limit?: number; cursor?: string }) {
      const listPrefix = prefix + (options?.prefix || '');
      const all = Array.from(store.keys())
        .filter(k => k.startsWith(listPrefix))
        .map(k => ({ name: k.slice(prefix.length), metadata: {} as Record<string, string> }));
      const limit = options?.limit || 1000;
      const start = options?.cursor ? parseInt(options.cursor) : 0;
      const sliced = all.slice(start, start + limit);
      return {
        keys: sliced,
        list_complete: start + limit >= all.length,
        cursor: sliced.length === limit ? String(start + limit) : undefined,
      };
    },
  };
}

// ---- 公开的 KV 命名空间操作 ----

// EdgeOne KV 仅支持数字、字母及下划线作为 key 字符，不能使用 ':'
// 旧格式使用 ':' 作为分隔符（如 prompt:xxx），已迁移为 '_'（如 prompt_xxx）
const KEY_SEP = '_';

export const KEY_PREFIX = {
  PROMPT: 'prompt' + KEY_SEP,
  CORPUS: 'corpus' + KEY_SEP,
  LOG: 'log' + KEY_SEP,
};

// 旧格式前缀（用于兼容迁移）
const OLD_KEY_PREFIX: Record<string, string> = {
  prompt_: 'prompt:',
  corpus_: 'corpus:',
  log_: 'log:',
};

export function promptKey(id: string): string { return KEY_PREFIX.PROMPT + id; }
export function corpusKey(id: string): string { return KEY_PREFIX.CORPUS + id; }
export function logKey(ts: string, id: string): string { return KEY_PREFIX.LOG + ts + '_' + id; }

// ---- 兼容层：同时支持新旧 key 格式 ----

/** 读取 JSON，先尝试新格式 key，失败则回退到旧格式（`:` 分隔符） */
export async function readJSONCompat<T>(ns: KVNamespace, key: string): Promise<T | null> {
  // 尝试新格式
  const result = await readJSON<T>(ns, key);
  if (result !== null) return result;
  // 回退旧格式
  const oldKey = toOldKey(key);
  if (oldKey && oldKey !== key) {
    const oldResult = await readJSON<T>(ns, oldKey);
    if (oldResult !== null) {
      // 迁移：把旧数据写到新 key，删除旧 key
      try {
        await writeJSON(ns, key, oldResult);
        await ns.delete(oldKey);
      } catch { /* 迁移失败不影响读取 */ }
      return oldResult;
    }
  }
  return null;
}

/** 列出指定前缀的 key，同时兼容新旧格式 */
export async function listKeysCompat(ns: KVNamespace, prefix: string, limit = 100): Promise<string[]> {
  const keys = await listKeys(ns, prefix, limit);
  // 同时尝试旧格式前缀
  const oldPrefix = toOldPrefix(prefix);
  if (oldPrefix && oldPrefix !== prefix) {
    const oldKeys = await listKeys(ns, oldPrefix, limit);
    // 合并去重：将旧格式 key 转换为新格式
    for (const ok of oldKeys) {
      const nk = toNewKey(ok, prefix);
      if (nk && !keys.includes(nk)) {
        keys.push(nk);
      }
    }
  }
  return keys;
}

/** 删除 key，同时清理可能的旧格式 */
export async function deleteCompat(ns: KVNamespace, key: string): Promise<void> {
  await ns.delete(key);
  const oldKey = toOldKey(key);
  if (oldKey && oldKey !== key) {
    try { await ns.delete(oldKey); } catch { /* 旧 key 不存在则忽略 */ }
  }
}

/** 将新格式 key 转为旧格式（_ → :） */
function toOldKey(key: string): string | null {
  for (const [newPref, oldPref] of Object.entries(OLD_KEY_PREFIX)) {
    if (key.startsWith(newPref)) {
      return oldPref + key.slice(newPref.length);
    }
  }
  return null;
}

/** 将旧格式 key 转为新格式（: → _）*/
function toNewKey(oldKey: string, newPrefix: string): string | null {
  for (const [newPref, oldPref] of Object.entries(OLD_KEY_PREFIX)) {
    if (oldKey.startsWith(oldPref)) {
      return newPref + oldKey.slice(oldPref.length);
    }
  }
  return null;
}

/** 新格式前缀 → 旧格式前缀 */
function toOldPrefix(newPrefix: string): string | null {
  return OLD_KEY_PREFIX[newPrefix] || null;
}

// 不再导出 namespace 对象，改为导出可直接调用的函数

export async function kvGet(ns: string, key: string): Promise<string | null> {
  const b = getBinding(ns);
  if (b) {
    try { return await b.get(key); } catch (e: any) {
      console.error(`[KV] kvGet("${ns}", "${key}") 失败:`, e?.message || e);
    }
  }
  return getMockStore(ns).get(key);
}

export async function kvPut(ns: string, key: string, value: string): Promise<void> {
  const b = getBinding(ns);
  if (b) {
    try { await b.put(key, value); return; } catch (e: any) {
      console.error(`[KV] kvPut("${ns}", "${key}") 失败:`, e?.message || e);
    }
  }
  return getMockStore(ns).put(key, value);
}

export async function kvDelete(ns: string, key: string): Promise<void> {
  const b = getBinding(ns);
  if (b) {
    try { await b.delete(key); return; } catch (e: any) {
      console.error(`[KV] kvDelete("${ns}", "${key}") 失败:`, e?.message || e);
    }
  }
  return getMockStore(ns).delete(key);
}

export async function kvList(ns: string, options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
  keys: Array<{ name: string }>; list_complete: boolean; cursor?: string;
}> {
  const b = getBinding(ns);
  if (b) {
    try {
      const r = await b.list(options || {});
      return {
        keys: (r.keys || []).map((k: any) => ({ name: k.name || k.key || (typeof k === 'string' ? k : '') })),
        list_complete: r.list_complete ?? r.complete ?? true,
        cursor: r.cursor || null,
      };
    } catch (e: any) {
      console.error(`[KV] kvList("${ns}") 失败:`, e?.message || e);
    }
  }
  return getMockStore(ns).list(options);
}

// ---- 旧的 KV namespace 对象（兼容旧代码）----
// 让旧代码的 import { kvCache } 依然可用

function compatNS(namespace: string): KVNamespace {
  return {
    get: (k: string) => kvGet(namespace, k),
    put: (k: string, v: string) => kvPut(namespace, k, v),
    delete: (k: string) => kvDelete(namespace, k),
    list: (o?: any) => kvList(namespace, o),
  };
}

export const kvCache = compatNS('CACHE');
export const kvPrompts = compatNS('PROMPTS');
export const kvCorpus = compatNS('CORPUS');
export const kvSettings = compatNS('SETTINGS');
export const kvLogs = compatNS('LOGS');

// ---- 内容管理 ----

import type { ContentBundle } from './content-defs';
import { DEFAULT_CONTENT } from './content-defs';

const CONTENT_KEY = 'content_bundle';

/** 读取可编辑内容（KV 值合并到默认值，保证新字段不缺失） */
export async function readContent(): Promise<ContentBundle> {
  try {
    const stored = await readJSON<Partial<ContentBundle>>(kvSettings, CONTENT_KEY);
    if (stored && typeof stored === 'object') {
      // 深度合并：stored 覆盖 default
      const merged = { ...DEFAULT_CONTENT };
      for (const key of Object.keys(stored) as (keyof ContentBundle)[]) {
        const v = stored[key];
        if (v !== undefined && v !== null) {
          (merged as any)[key] = v;
        }
      }
      return merged;
    }
  } catch { /* KV 不可用，返回默认值 */ }
  return { ...DEFAULT_CONTENT };
}

/** 写入可编辑内容（全量覆盖存储） */
export async function writeContent(bundle: ContentBundle): Promise<void> {
  await writeJSON(kvSettings, CONTENT_KEY, bundle);
}

// ---- 工具函数（签名不变）----

/** 读取 JSON 对象（单次 KV 读取，不做 type: json 二次回退） */
export async function readJSON<T>(ns: KVNamespace, key: string): Promise<T | null> {
  try {
    const raw = await ns.get(key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as T; } catch { return null; }
    }
    if (typeof raw === 'object') return raw as T;
    return null;
  } catch (e: any) {
    console.error(`[KV] readJSON 失败 (ns=${ns.constructor?.name || 'KVNamespace'}, key="${key}"):`, e?.message || e);
    return null;
  }
}

/** 写入 JSON 对象 */
export async function writeJSON(ns: KVNamespace, key: string, value: any): Promise<void> {
  await ns.put(key, JSON.stringify(value));
}

/** 生成唯一 ID */
export function generateId(): string {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// ---- List 操作 ----

const MAX_KV_LIMIT = 200;

function filterByPrefix(keys: string[], prefix: string): string[] {
  return keys.filter(k => k && k.startsWith(prefix));
}

/** 解析 KV list 返回的 key 名称（EdgeOne 用 "key"，Cloudflare 用 "name"） */
function keyName(k: any): string {
  if (typeof k === 'string') return k;
  return k?.name || k?.key || '';
}

/** 列出某命名空间下所有 key（带前缀） */
export async function listKeys(ns: KVNamespace, prefix: string, limit = 100): Promise<string[]> {
  const safeLimit = Math.min(limit, MAX_KV_LIMIT);
  try {
    const r = await ns.list({ prefix, limit: safeLimit });
    const keys = (r.keys || []).map(keyName);
    return filterByPrefix(keys, prefix).slice(0, limit);
  } catch (e: any) {
    console.error(`[KV] listKeys 失败 (prefix="${prefix}"):`, e?.message || e);
    return [];
  }
}

/**
 * 清理旧日志 — 仅保留最新 maxCount 条
 * 使用分页遍历所有 log key，按时间排序后删除最旧的
 * 返回删除数量
 */
export async function trimLogs(maxCount = 100): Promise<number> {
  const ns = kvLogs;
  const prefix = KEY_PREFIX.LOG;

  // 分页收集所有 log key
  let allKeys: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const result = await listKeysPaginated(ns, prefix, 200, cursor);
    allKeys = allKeys.concat(result.keys);
    if (result.complete || !result.cursor) break;
    cursor = result.cursor;
  }

  if (allKeys.length <= maxCount) return 0;

  // key 以时间戳为前缀，字母序 = 时间序（升序 = 最旧在前）
  allKeys.sort();
  const toDelete = allKeys.slice(0, allKeys.length - maxCount);

  for (const key of toDelete) {
    await deleteCompat(ns, key);
  }

  return toDelete.length;
}

/** 分页列出 */
export async function listKeysPaginated(
  ns: KVNamespace, prefix: string, limit: number, cursor?: string,
) {
  const safeLimit = Math.min(limit, MAX_KV_LIMIT);
  const params: any = { limit: safeLimit };
  if (cursor) params.cursor = cursor;

  try {
    params.prefix = prefix;
    const r = await ns.list(params);
    const keys = (r.keys || []).map(keyName);
    return {
      keys: filterByPrefix(keys, prefix),
      cursor: r.cursor || null,
      complete: r.list_complete ?? r.complete ?? true,
    };
  } catch (e: any) {
    console.error(`[KV] listKeysPaginated 失败 (prefix="${prefix}"):`, e?.message || e);
    return { keys: [], cursor: null, complete: true };
  }
}
