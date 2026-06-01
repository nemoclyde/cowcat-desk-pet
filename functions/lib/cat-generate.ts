/**
 * 共享生成逻辑 — 供 speak / internal generate / admin generate 复用
 */
import { catGenerate, detectMood } from './doubao';
import { collectCatContext, buildCatPrompt, getActivePrompt, getCorpusExamples } from './cat-prompt';
import { kvCache, kvSettings, kvLogs, readJSON, writeJSON, generateId, logKey, trimLogs, initKVEnv } from './kv';

// 生成计数器，用于降频 trimLogs（每 5 次生成清理一次日志）
let _generateCount = 0;

export interface GenerateOptions {
  /** 用户手动输入的 prompt（admin generate 用） */
  userPrompt?: string;
  /** 触发方式 */
  trigger: 'manual' | 'scheduled' | 'auto';
  /** EdgeOne env（背景刷新时需要传入以确保 KV 绑定可用） */
  env?: any;
}

export interface GenerateResult {
  text: string;
  mood: string;
  tokensUsed: number;
  latencyMs: number;
  searchesUsed: number;
  searchQueries: string[];
  promptName: string;
  rawRequest?: any;
  rawResponse?: any;
  fullOutput?: any[];
}

export async function performGenerate(opts: GenerateOptions): Promise<GenerateResult> {
  // 背景刷新场景：重新初始化 KV 绑定以确保写入成功
  if (opts.env) initKVEnv(opts.env);
  const startTime = Date.now();

  // 读取设置
  const settings = await readJSON<any>(kvSettings, 'general') || {};
  const city = settings.weatherCity || '北京';

  // 并行：提示词 + 语料库 + 上下文（三者无依赖，并发执行减少延迟）
  const [activePrompt, corpusExamples, ctx] = await Promise.all([
    getActivePrompt(),
    getCorpusExamples(5),
    collectCatContext(city),
  ]);

  const userPrompt = opts.userPrompt || '';
  const fullPrompt = await buildCatPrompt(ctx, {
    userPrompt,
    systemPrompt: activePrompt?.systemPrompt,
    userPromptTemplate: activePrompt?.userPromptTemplate,
    corpusExamples,
    wrapper: settings.promptWrapper || undefined,
    defaultTaskPrompt: settings.defaultTaskPrompt || undefined,
  });

  // 调用豆包
  const result = await catGenerate(fullPrompt, { city });
  const mood = detectMood(result.text);
  const latencyMs = Date.now() - startTime;

  // ---- 写缓存 ----
  const cacheEntry = {
    text: result.text,
    mood,
    responseId: result.responseId,
    generatedAt: new Date().toISOString(),
    context: {
      prompt: userPrompt || activePrompt?.userPromptTemplate || '(默认)',
      promptName: activePrompt?.name || '默认人设',
    },
  };
  await writeJSON(kvCache, 'current', cacheEntry);

  // 更新历史缓存
  const history = await readJSON<any[]>(kvCache, 'history') || [];
  history.unshift(cacheEntry);
  const maxHistory = settings.maxHistoryCache || 50;
  if (history.length > maxHistory) history.length = maxHistory;
  await writeJSON(kvCache, 'history', history);

  // ---- 写日志 ----
  const logEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    input: {
      userPrompt: userPrompt || activePrompt?.userPromptTemplate || (opts.trigger === 'scheduled' ? '(定时触发)' : '(自动刷新)'),
      systemPrompt: activePrompt?.systemPrompt || '(默认人设)',
      promptName: activePrompt?.name || '默认人设',
      fullPrompt,
    },
    output: {
      text: result.text,
      mood,
      tokensUsed: result.tokensUsed,
      latencyMs,
      searchesUsed: result.searchesUsed,
      searchQueries: result.searchQueries,
      fullOutput: result._fullOutput || [],
    },
    rawExchange: {
      request: result._rawRequest || null,
      response: result._rawResponse || null,
    },
    trigger: opts.trigger,
  };
  const lk = logKey(new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15), logEntry.id);
  await writeJSON(kvLogs, lk, logEntry);

  // 自动清理旧日志（每 5 次生成执行一次，避免每次都全量遍历 KV）
  _generateCount++;
  const maxLogCount = settings.maxLogCount || settings.logRetentionDays || 100;
  if (_generateCount % 5 === 0) {
    trimLogs(maxLogCount).catch(() => {});
  }

  return {
    text: result.text,
    mood,
    tokensUsed: result.tokensUsed,
    latencyMs,
    searchesUsed: result.searchesUsed,
    searchQueries: result.searchQueries,
    promptName: activePrompt?.name || '默认人设',
    rawRequest: result._rawRequest,
    rawResponse: result._rawResponse,
    fullOutput: result._fullOutput,
  };
}

/**
 * 检查缓存是否过期（超过 generateInterval 分钟）
 * 返回 true 表示需要刷新
 *
 * @param cached 可选，传入已读取的缓存对象避免重复 KV 读取
 */
export async function isCacheStale(cached?: any): Promise<boolean> {
  try {
    const settings = await readJSON<any>(kvSettings, 'general') || {};
    const intervalMin = settings.generateInterval || 10;
    if (!cached) {
      cached = await readJSON<any>(kvCache, 'current');
    }
    if (!cached?.generatedAt) return true;

    const ageMs = Date.now() - new Date(cached.generatedAt).getTime();
    return ageMs > intervalMin * 60 * 1000;
  } catch {
    return true; // 读取失败就当过期处理
  }
}
