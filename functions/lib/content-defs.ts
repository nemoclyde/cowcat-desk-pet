/**
 * 可编辑内容定义 — 所有发送给 AI 的中文文本集中管理
 * 通过管理后台「内容管理」Tab 编辑，KV 持久化
 *
 * 每个字段都有硬编码默认值，KV 不可用时自动回退
 */
export interface ContentBundle {
  // ====== 工具描述 (发送给豆包 API 的 tool description) ======
  toolDesc_time: string;
  toolDesc_weather: string;
  toolDesc_weather_param: string;
  toolDesc_holiday: string;
  toolDesc_corpusSearch: string;
  toolDesc_corpusSearch_param: string;

  // ====== 时间文案 ======
  weekdays: string[];
  periods: string[];
  time_isWeekend: string;
  time_isWeekday: string;

  // ====== 天气文案 ======
  weather_conditions: Record<string, string>;
  weather_catNotes: Record<string, string>;
  weather_rainWarning: string;
  weather_fallback: string;
  weather_serviceDown: string;

  // ====== 节日文案 ======
  holiday_names: Record<string, string>;
  holiday_catMessages: Record<string, string>;
  holiday_noHoliday: string;
  holiday_weekend: string;

  // ====== 兜底文案 ======
  fallback_emptyResponse: string;
  fallback_noSpeakCache: string;
  fallback_speakError: string;
  fallback_defaultSystemPrompt: string;
  fallback_defaultUserPrompt: string;

  // ====== 搜索规则 (在 prompt wrapper 中) ======
  searchRules: string;
}

/** 硬编码默认值 — KV 为空时回退 */
export const DEFAULT_CONTENT: ContentBundle = {
  toolDesc_time: '获取当前日期和时间信息，包括星期几、当前时段（凌晨/早上/上午/中午/下午/晚上/深夜）',
  toolDesc_weather: '获取指定城市的实时天气信息，包括温度、天气状况、湿度、风力等。当用户提到天气相关话题时必须调用。',
  toolDesc_weather_param: '城市名称，如"北京"、"上海"、"深圳"',
  toolDesc_holiday: '获取今天的节日信息，包括公历节日和中国传统农历节日（春节、中秋、端午等）',
  toolDesc_corpusSearch: '从语料库中搜索相关内容。语料库包含奶牛猫常用的梗、段子、口头禅等。当你想找一些有趣的说法或特定的梗时使用。',
  toolDesc_corpusSearch_param: '搜索关键词，如"吐槽"、"撒娇"、"节日"、"天气"、"深夜"',

  weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  periods: ['凌晨', '早上', '上午', '中午', '下午', '傍晚', '晚上', '深夜'],
  time_isWeekend: '今天是周末，主人可能在家',
  time_isWeekday: '今天是工作日',

  weather_conditions: {
    '0': '晴朗', '1': '多云', '2': '阴天',
    '3': '雾/霾', '4': '毛毛雨', '5': '下雨',
    '6': '下雪', '7': '阵雨', '8': '阵雪',
    '9': '雷阵雨', '10': '恶劣天气',
  },
  weather_catNotes: {
    hot: '太热了！本喵要化了喵...',
    warm: '有点热，本喵只想摊在地上',
    cold: '冷死了！本喵要钻被窝',
    cool: '有点凉，适合本喵跑酷取暖',
    pleasant: '温度舒适，适合趴窗台看鸟',
  },
  weather_rainWarning: '下雨天，提醒两脚兽带伞喵~',
  weather_fallback: '晴朗（默认值）',
  weather_serviceDown: '天气服务暂不可用',

  holiday_names: {},
  holiday_catMessages: {},
  holiday_noHoliday: '无特别节日',
  holiday_weekend: '周末休息日',

  fallback_emptyResponse: '（本喵走神了...没想好说什么喵~）',
  fallback_noSpeakCache: '喵~ 本喵刚睡醒，还没想好要说什么... 等下再问我吧！',
  fallback_speakError: '喵？出错了...本喵也不知道发生了什么喵...',
  fallback_defaultSystemPrompt: '你是叫小斑的奶牛猫，住在主人电脑桌面上，性格慵懒傲娇又黏人。自称"本喵"，叫主人"两脚兽"或"铲屎的"。回复时带喵~、哼！、嗷！等猫语气词。',
  fallback_defaultUserPrompt: '请根据当前时间，以奶牛猫的口吻说几句话。可以适当吐槽主人，表达当下的心情。',

  searchRules: [
    '- 如果回复涉及实时信息（天气、新闻、热点事件、具体事实数据等），请使用 web_search 搜索',
    '- 如果是日常闲聊、撒娇、吐槽、心情抒发等不需要实时数据的内容，不要搜索',
    '- 上下文中已提供了时间等基础信息，无需为此搜索',
  ].join('\n'),
};
