/**
 * 豆包 Responses API 封装
 *
 * 使用官方 web_search 插件（仅默认搜索引擎，不加付费源）
 * 时间/节日由 cat-prompt.ts 本地收集；天气/新闻等实时信息由 web_search 获取
 * 模型自主判断是否需要搜索，max_keyword=2 控制成本
 *
 * API 文档: https://www.volcengine.com/docs/82379/1569618
 * Base URL: https://ark.cn-beijing.volces.com/api/v3
 */

// ---- 类型 ----

interface ResponsesRequest {
  model: string;
  max_output_tokens?: number;
  thinking?: { type: 'enabled' | 'disabled' | 'auto' };
  tools?: Array<{
    type: 'web_search';
    max_keyword: number;
    limit?: number;
    user_location?: {
      type: 'approximate';
      country: string;
      region: string;
      city: string;
    };
  }>;
  input: Array<{
    type: 'message';
    role: 'user';
    content: Array<{
      type: 'input_text';
      text: string;
    }>;
  }>;
}

interface ResponsesResponse {
  id: string;
  model: string;
  output: Array<{
    type: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface CatGenerateResult {
  text: string;
  tokensUsed: number;
  responseId: string;
  /** 搜索了多少次 */
  searchesUsed: number;
  /** 搜索查询列表 */
  searchQueries: string[];
  /** 发送给豆包 API 的原始请求体 */
  _rawRequest?: any;
  /** 豆包 API 返回的原始响应 JSON */
  _rawResponse?: any;
  /** 完整 output 数组（含搜索细节） */
  _fullOutput?: any[];
}

// ---- 配置 ----

const DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'doubao-seed-2-0-lite-260215';

/** 读取 API Key */
async function getApiKey(): Promise<string> {
  try {
    // @ts-ignore — EdgeOne 环境变量
    if (typeof DOUBAO_API_KEY !== 'undefined') {
      // @ts-ignore
      return DOUBAO_API_KEY;
    }
  } catch {}
  if (typeof process !== 'undefined' && process.env?.DOUBAO_API_KEY) {
    return process.env.DOUBAO_API_KEY;
  }
  return '';
}

/** 从 KV 读取豆包设置 */
export async function getDoubaoSettings(): Promise<{
  model: string;
  apiKey: string;
  city: string;
  maxOutputTokens: number;
  disableThinking: boolean;
}> {
  try {
    const { kvSettings, readJSON } = await import('./kv');
    const [dbSettings, generalSettings] = await Promise.all([
      readJSON<{ model?: string; apiKey?: string; maxOutputTokens?: number; disableThinking?: boolean }>(kvSettings, 'doubao'),
      readJSON<{ weatherCity?: string }>(kvSettings, 'general'),
    ]);
    const envKey = await getApiKey();
    return {
      model: dbSettings?.model || DEFAULT_MODEL,
      apiKey: dbSettings?.apiKey || envKey,
      city: generalSettings?.weatherCity || '北京',
      maxOutputTokens: dbSettings?.maxOutputTokens || 256,
      disableThinking: dbSettings?.disableThinking ?? true,
    };
  } catch {
    return {
      model: DEFAULT_MODEL,
      apiKey: await getApiKey(),
      city: '北京',
      maxOutputTokens: 256,
      disableThinking: true,
    };
  }
}

// ---- 核心调用 ----

/**
 * 调用豆包 Responses API（web_search 插件，模型自主判断是否搜索）
 *
 * @param prompt  - 完整 prompt 文本（已含时间/节日等本地上下文）
 * @param options - 可选配置（city 用于优化搜索地理位置）
 */
export async function catGenerate(
  prompt: string,
  options?: {
    model?: string;
    apiKey?: string;
    city?: string;
  },
): Promise<CatGenerateResult> {
  const settings = await getDoubaoSettings();
  const apiKey = options?.apiKey || settings.apiKey;
  const city = options?.city || settings.city;

  if (!apiKey) {
    throw new Error('豆包 API Key 未配置，请在管理后台「设置」页面配置');
  }

  const body: ResponsesRequest = {
    model: options?.model || settings.model,
    // 成本控制：限制输出 token（奶牛猫只说 1-3 句，256 足够）
    max_output_tokens: settings.maxOutputTokens,
    // 关闭深度思考：桌宠不需要深度推理，能省大量 token
    thinking: settings.disableThinking ? { type: 'disabled' } : { type: 'auto' },
    // web_search: 仅默认引擎，max_keyword=1 控制成本
    tools: [{
      type: 'web_search',
      max_keyword: 1,
      limit: 5,
      user_location: {
        type: 'approximate',
        country: '中国',
        region: city,
        city,
      },
    }],
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt,
          },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch(`${DOUBAO_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`豆包 API 错误 (${response.status}): ${errText.slice(0, 300)}`);
  }

  const result: ResponsesResponse = await response.json();

  // 提取回复文本 + 搜索信息
  let text = '';
  let searchesUsed = 0;
  const searchQueries: string[] = [];
  // 保存完整 output 用于日志记录
  const fullOutput: any[] = [];

  for (const item of result.output) {
    // 深拷贝一份给 fullOutput
    const cleanItem: any = { type: item.type, role: item.role };
    if (item.content) {
      cleanItem.content = item.content.map((c: any) => {
        const { type, text: t } = c;
        const entry: any = { type };
        if (t !== undefined) entry.text = t;
        // 捕获搜索调用
        if (type === 'web_search_call' && c.action) {
          entry.query = c.action.query || '';
          searchQueries.push(entry.query);
        }
        // 捕获搜索结果摘要
        if (type === 'web_search_call_result') {
          searchesUsed++;
          entry.resultCount = c.results?.length || 0;
          entry.results = (c.results || []).slice(0, 5).map((r: any) => ({
            title: r.title || '', snippet: (r.snippet || '').slice(0, 120),
          }));
        }
        // 捕获最终文本
        if (type === 'output_text' && t) {
          text += t;
        }
        return entry;
      });
    }
    fullOutput.push(cleanItem);
  }

  if (!text) {
    // 从 KV 内容管理读取兜底文案，不可用时回退硬编码
    try {
      const { readContent } = await import('./kv');
      const ct = await readContent();
      text = ct.fallback_emptyResponse || '（本喵走神了...没想好说什么喵~）';
    } catch {
      text = '（本喵走神了...没想好说什么喵~）';
    }
  }

  return {
    text: text.trim(),
    tokensUsed: result.usage?.total_tokens || 0,
    responseId: result.id,
    searchesUsed,
    searchQueries,
    _rawRequest: body,
    _rawResponse: result,
    _fullOutput: fullOutput,
  };
}

/** 简单的心情检测（基于关键词） */
export function detectMood(text: string): string {
  const moods: Array<{ key: string; keywords: string[] }> = [
    { key: '开心', keywords: ['喵~', '喵呜', '开心', '好棒', '嘿嘿', '哈哈', '玩'] },
    { key: '傲娇', keywords: ['哼', '才不', '笨蛋', '随便', '两脚兽', '铲屎'] },
    { key: '慵懒', keywords: ['困', '累', '睡', '躺', '懒', 'zzz', '💤', '呼噜'] },
    { key: '撒娇', keywords: ['蹭蹭', '摸摸', '抱抱', '想', '饿', '罐头', '猫条', '喂'] },
    { key: '疯癫', keywords: ['嗷', '跑酷', '冲', '跳', '抓', '咬', '！'] },
    { key: '关心', keywords: ['小心', '注意', '记得', '别忘', '冷', '热', '下雨', '带伞'] },
  ];

  for (const mood of moods) {
    if (mood.keywords.some(kw => text.includes(kw))) {
      return mood.key;
    }
  }
  return '日常';
}
