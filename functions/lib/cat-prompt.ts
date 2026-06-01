/**
 * 奶牛猫 Prompt 构建器
 * admin/generate.ts 和 internal/generate.ts 共用
 */
import { handler as timeHandler } from './tools/time';
import { handler as weatherHandler } from './tools/weather';
import { handler as holidayHandler } from './tools/holiday';
import { kvPrompts, kvCorpus, readJSONCompat, listKeysCompat, KEY_PREFIX } from './kv';

export interface CatContext {
  time: {
    datetime: string;
    weekday: string;
    period: string;
    hour: string;
    isWeekend: boolean;
    isMealTime: boolean;
  };
  weather: {
    city: string;
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
    catNote?: string;
    rainWarning?: string | null;
  };
  holiday: {
    date: string;
    isHoliday: boolean;
    holidays: string[];
    catMessage?: string | null;
  };
}

/** 默认系统提示词（从 KV 内容管理读取，在线可编辑） */
async function getDefaultSystemPrompt(): Promise<string> {
  try {
    const { readContent } = await import('./kv');
    const ct = await readContent();
    return ct.fallback_defaultSystemPrompt || '你是叫小斑的奶牛猫，住在主人电脑桌面上，性格慵懒傲娇又黏人。自称"本喵"，叫主人"两脚兽"或"铲屎的"。回复时带喵~、哼！、嗷！等猫语气词。';
  } catch {
    return '你是叫小斑的奶牛猫，住在主人电脑桌面上，性格慵懒傲娇又黏人。自称"本喵"，叫主人"两脚兽"或"铲屎的"。回复时带喵~、哼！、嗷！等猫语气词。';
  }
}

async function getDefaultUserPrompt(): Promise<string> {
  try {
    const { readContent } = await import('./kv');
    const ct = await readContent();
    return ct.fallback_defaultUserPrompt || '请根据当前时间，以奶牛猫的口吻说几句话。可以适当吐槽主人，表达当下的心情。';
  } catch {
    return '请根据当前时间，以奶牛猫的口吻说几句话。可以适当吐槽主人，表达当下的心情。';
  }
}

/** 默认 Prompt 外包装模板 — 用户可在设置中自定义 */
export const DEFAULT_PROMPT_WRAPPER = [
  '【你的任务 — 请严格遵循以下指令，这是你最优先要做的事】',
  '{{TASK}}',
  '{{CORPUS}}',
  '【角色设定 — 这是你说话的身份和风格，用于塑造你的语气，但不要让它覆盖上面的任务指令】',
  '{{CHARACTER}}',
  '',
  '{{TIME}}',
  '',
  '【联网搜索规则】',
  '- 如果回复涉及实时信息（天气、新闻、热点事件、具体事实数据等），请使用 web_search 搜索',
  '- 如果是日常闲聊、撒娇、吐槽、心情抒发等不需要实时数据的内容，不要搜索',
  '- 上下文中已提供了时间等基础信息，无需为此搜索',
].join('\n');

/** 收集上下文（时间/天气/节日） */
export async function collectCatContext(city: string): Promise<CatContext> {
  const [timeRaw, weatherRaw, holidayRaw] = await Promise.all([
    timeHandler({}),
    weatherHandler({ city }),
    holidayHandler({}),
  ]);

  const time = JSON.parse(timeRaw);
  const weather = JSON.parse(weatherRaw);
  const holiday = JSON.parse(holidayRaw);

  return { time, weather, holiday };
}

/** 从 KV 提示词表中读取激活的提示词 */
export async function getActivePrompt(): Promise<{
  systemPrompt: string;
  userPromptTemplate: string;
  name: string;
} | null> {
  try {
    const keys = await listKeysCompat(kvPrompts, KEY_PREFIX.PROMPT, 100);
    const results = await Promise.all(keys.map(k => readJSONCompat<{
      id: string; name: string; systemPrompt: string;
      userPromptTemplate: string; isActive: boolean;
    }>(kvPrompts, k).catch(() => null)));
    for (const p of results) {
      if (p && p.isActive) {
        return {
          systemPrompt: p.systemPrompt || await getDefaultSystemPrompt(),
          userPromptTemplate: p.userPromptTemplate || '',
          name: p.name || '未命名',
        };
      }
    }
  } catch { /* KV 不可用时返回 null */ }
  return null;
}

/** 从 KV 语料库中随机取 N 条作为风格参考 */
export async function getCorpusExamples(limit = 5): Promise<string[]> {
  try {
    const keys = await listKeysCompat(kvCorpus, KEY_PREFIX.CORPUS, 200);
    if (keys.length === 0) return [];
    // 随机洗牌取 limit 条
    const shuffled = keys.sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(limit, shuffled.length));
    const results = await Promise.all(picked.map(k =>
      readJSONCompat<{ content: string }>(kvCorpus, k).catch(() => null)
    ));
    return results.filter((e): e is { content: string } => e != null && !!e.content)
      .map(e => e.content);
  } catch { return []; }
}

/** 变量插值：替换 {{time}} {{weather}} {{holiday}} {{context}} */
function interpolateVars(template: string, ctx: CatContext): string {
  const contextText = [
    `现在是${ctx.time.datetime}，${ctx.time.weekday}，${ctx.time.period}`,
    ctx.weather.city ? `${ctx.weather.city} ${ctx.weather.condition} ${ctx.weather.temperature}°C` : '',
    ctx.holiday.isHoliday && ctx.holiday.holidays.length > 0
      ? `今天是${ctx.holiday.holidays.join('、')}` : '',
    ctx.time.isMealTime ? '现在是饭点' : '',
  ].filter(Boolean).join('；');

  return template
    .replace(/\{\{time\}\}/g, `${ctx.time.datetime} ${ctx.time.weekday} ${ctx.time.period}`)
    .replace(/\{\{weather\}\}/g, ctx.weather.city
      ? `${ctx.weather.city} ${ctx.weather.condition} ${ctx.weather.temperature}°C 湿度${ctx.weather.humidity}%`
      : '天气未知')
    .replace(/\{\{holiday\}\}/g, ctx.holiday.isHoliday && ctx.holiday.holidays.length > 0
      ? ctx.holiday.holidays.join('、')
      : '无特殊节日')
    .replace(/\{\{context\}\}/g, contextText || '暂无上下文');
}

/** 构建发送给豆包的完整 prompt
 *
 * 优先级设计（从高到低）：
 * 1. 用户任务指令（userPromptTemplate / userPrompt）— FIRST，标注为"你的任务"
 * 2. 奶牛猫角色设定（systemPrompt）— SECOND，标注为"角色设定"
 * 3. 语料库风格参考
 * 4. 当前环境上下文（时间/天气/节日）
 *
 * 这样用户的自定义提示词始终拥有最高优先级，
 * 而系统提示词只作为角色背景，不会覆盖用户指令。
 */
export async function buildCatPrompt(
  ctx: CatContext,
  options?: {
    userPrompt?: string;
    systemPrompt?: string;
    userPromptTemplate?: string;
    corpusExamples?: string[];
    /** 自定义 prompt 外包装模板，支持 {{TASK}} {{CHARACTER}} {{CORPUS}} {{TIME}} */
    wrapper?: string;
    /** 默认任务指令（设置中的 defaultTaskPrompt），优先级低于 userPromptTemplate */
    defaultTaskPrompt?: string;
  },
): Promise<string> {
  const systemPrompt = options?.systemPrompt || await getDefaultSystemPrompt();
  const corpusExamples = options?.corpusExamples || [];

  // 使用模板或默认 user prompt — 优先级：
  // 1. userPromptTemplate（激活提示词的任务模板，最高）
  // 2. userPrompt（仪表盘手动输入）
  // 3. defaultTaskPrompt（设置中配置的默认任务指令）
  // 4. DEFAULT_USER_PROMPT（代码硬编码兜底）
  let userPrompt: string;
  const template = options?.userPromptTemplate || '';
  if (template.trim()) {
    userPrompt = interpolateVars(template, ctx);
  } else if (options?.userPrompt && options.userPrompt.trim()) {
    userPrompt = options.userPrompt.trim();
  } else if (options?.defaultTaskPrompt && options.defaultTaskPrompt.trim()) {
    userPrompt = options.defaultTaskPrompt.trim();
  } else {
    userPrompt = await getDefaultUserPrompt();
  }

  // 语料库示例（作为风格参考）
  const corpusSection = corpusExamples.length > 0
    ? `${corpusExamples.map((e, i) => `${i + 1}. "${e}"`).join('\n')}`
    : '';

  const timeStr = `现在是${ctx.time.datetime}，${ctx.time.weekday}。`;

  // 使用自定义 wrapper 或默认模板
  const wrapper = options?.wrapper || DEFAULT_PROMPT_WRAPPER;
  return wrapper
    .replace(/\{\{TASK\}\}/g, userPrompt)
    .replace(/\{\{CHARACTER\}\}/g, systemPrompt)
    .replace(/\{\{CORPUS\}\}/g, corpusSection)
    .replace(/\{\{TIME\}\}/g, timeStr);
}
