/**
 * 时间工具 — get_current_time
 * 获取当前时间、星期、时段（文案从 KV 内容管理读取，支持在线编辑）
 */

import { readContent } from '../kv';
import type { ContentBundle } from '../content-defs';

export const timeTool = {
  name: 'get_current_time',
  description: '获取当前日期和时间信息，包括星期几、当前时段（凌晨/早上/上午/中午/下午/晚上/深夜）',
  parameters: {} as Record<string, any>,
};

export async function handler(_args: Record<string, any>): Promise<string> {
  const ct: ContentBundle = await readContent();
  const now = new Date();
  const beijingTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));

  const year = beijingTime.getFullYear();
  const month = beijingTime.getMonth() + 1;
  const day = beijingTime.getDate();
  const hour = beijingTime.getHours();
  const minute = beijingTime.getMinutes();
  const weekday = (ct.weekdays || ['周日', '周一', '周二', '周三', '周四', '周五', '周六'])[beijingTime.getDay()];

  const periods = ct.periods || ['凌晨', '早上', '上午', '中午', '下午', '傍晚', '晚上', '深夜'];
  let period: string;
  if (hour >= 0 && hour < 5) period = periods[0];
  else if (hour >= 5 && hour < 8) period = periods[1];
  else if (hour >= 8 && hour < 11) period = periods[2];
  else if (hour >= 11 && hour < 13) period = periods[3];
  else if (hour >= 13 && hour < 17) period = periods[4];
  else if (hour >= 17 && hour < 19) period = periods[5];
  else if (hour >= 19 && hour < 23) period = periods[6];
  else period = periods[7];

  const isWeekend = beijingTime.getDay() === 0 || beijingTime.getDay() === 6;
  const isMealTime = (hour === 7 || hour === 8 || hour === 12 || hour === 18 || hour === 19);

  return JSON.stringify({
    datetime: `${year}年${month}月${day}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    weekday,
    period,
    hour: hour.toString(),
    isWeekend,
    isMealTime,
    tips: isWeekend ? (ct.time_isWeekend || '今天是周末，主人可能在家') : (ct.time_isWeekday || '今天是工作日'),
  });
}
