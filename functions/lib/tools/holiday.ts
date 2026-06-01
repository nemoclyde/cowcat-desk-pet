/**
 * 节日工具 — get_holiday_info
 * 获取今日节日信息（公历 + 农历传统节日，文案从 KV 内容管理读取）
 */

import { readContent } from '../kv';
import type { ContentBundle } from '../content-defs';

export const holidayTool = {
  name: 'get_holiday_info',
  description: '获取今天的节日信息',
  parameters: {} as Record<string, any>,
};

// 中国农历节日数据（2026年）— 使用近似日期作为默认值
const DEFAULT_LUNAR: Record<string, string> = {
  '2026-02-17': '除夕🧧',
  '2026-02-18': '春节🧨 大年初一',
  '2026-02-19': '春节 大年初二',
  '2026-02-20': '春节 大年初三',
  '2026-02-21': '春节 大年初四',
  '2026-02-22': '春节 大年初五（迎财神）',
  '2026-02-23': '春节 大年初六',
  '2026-02-24': '春节 大年初七（人日）',
  '2026-04-05': '清明节🌿',
  '2026-06-19': '端午节🐲',
  '2026-09-25': '中秋节🥮',
  '2026-10-18': '重阳节🌺',
};

const DEFAULT_SOLAR: Record<string, string> = {
  '01-01': '元旦🎉', '02-14': '情人节💕', '03-08': '妇女节👩',
  '03-12': '植树节🌳', '04-01': '愚人节🤡', '05-01': '劳动节🔧',
  '05-04': '青年节🌟', '06-01': '儿童节🎈', '07-01': '建党节🚩',
  '08-01': '建军节🪖', '09-10': '教师节📚', '10-01': '国庆节🇨🇳',
  '10-31': '万圣节🎃', '11-11': '光棍节/购物节🛒',
  '12-24': '平安夜🎄', '12-25': '圣诞节🎅', '12-31': '跨年夜🌃',
};

const DEFAULT_SPECIAL: Record<string, string> = {
  '05-20': '520 表白日💗', '05-21': '521 表白日💗',
  '06-18': '618 购物节📦', '08-08': '国际猫猫日🐱',
  '11-11': '双十一🛍️',
};

export async function handler(_args: Record<string, any>): Promise<string> {
  const ct: ContentBundle = await readContent();
  const now = new Date();
  const beijingTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));

  const dateStr = beijingTime.toISOString().slice(0, 10);
  const mmdd = dateStr.slice(5);

  // KV 节日名覆盖默认值
  const kvNames = ct.holiday_names || {};
  const solar = { ...DEFAULT_SOLAR, ...kvNames };
  const special = { ...DEFAULT_SPECIAL, ...kvNames };
  const lunar = { ...DEFAULT_LUNAR, ...kvNames };

  const holidays: string[] = [];
  let isHoliday = false;

  if (solar[mmdd]) { holidays.push(solar[mmdd]); isHoliday = true; }
  if (special[mmdd]) { holidays.push(special[mmdd]); isHoliday = true; }
  if (lunar[dateStr]) { holidays.push(lunar[dateStr]); isHoliday = true; }

  const dayOfWeek = beijingTime.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    holidays.push(ct.holiday_weekend || '周末休息日');
  }

  const catMsgs = ct.holiday_catMessages || {};

  return JSON.stringify({
    date: dateStr,
    mmdd,
    isHoliday,
    holidays: holidays.length > 0 ? holidays : [ct.holiday_noHoliday || '无特别节日'],
    catMessage: getCatMessage(holidays, dayOfWeek, catMsgs),
  });
}

function getCatMessage(holidays: string[], dayOfWeek: number, catMsgs: Record<string, string>): string | null {
  if (holidays.some(h => h.includes('猫')))
    return catMsgs.catDay || '今天是国际猫猫日！本喵的节日！快开罐头庆祝喵~';
  if (holidays.some(h => h.includes('春节')))
    return catMsgs.springFestival || '过年啦！本喵也要穿新衣服，吃大鱼大肉喵！';
  if (holidays.some(h => h.includes('中秋')))
    return catMsgs.midAutumn || '中秋节！虽然本喵不能吃月饼，但可以趴在窗台赏月喵~';
  if (holidays.some(h => h.includes('端午')))
    return catMsgs.dragonBoat || '端午节！本喵想吃粽子...不对，猫不能吃糯米，算了喵。';
  if (holidays.some(h => h.includes('国庆')))
    return catMsgs.nationalDay || '放假啦！两脚兽终于可以在家陪本喵整整七天喵~';
  if (holidays.some(h => h.includes('情人节')))
    return catMsgs.valentine || '情人节？两脚兽你有对象吗就在这过节（鄙视脸）';
  if (holidays.some(h => h.includes('周末')))
    return catMsgs.weekend || '周末！两脚兽不许睡懒觉，本喵饿了快起来喂饭！';
  return null;
}
