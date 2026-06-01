/**
 * 天气工具 — get_weather
 * 通过 open-meteo API 获取实时天气（文案从 KV 内容管理读取，支持在线编辑）
 */

import { readContent } from '../kv';
import type { ContentBundle } from '../content-defs';

export const weatherTool = {
  name: 'get_weather',
  description: '获取指定城市的实时天气信息',
  parameters: {
    city: {
      type: 'string',
      description: '城市名称',
    },
  } as Record<string, any>,
};

// 和风天气免费 API（无需 key 的天气 API 备选）
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
// 城市坐标映射（中国主要城市）
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  // 直辖市
  '北京': { lat: 39.9042, lon: 116.4074 },
  '上海': { lat: 31.2304, lon: 121.4737 },
  '天津': { lat: 39.3434, lon: 117.3616 },
  '重庆': { lat: 29.4316, lon: 106.9123 },
  // 省会城市
  '广州': { lat: 23.1291, lon: 113.2644 },
  '深圳': { lat: 22.5431, lon: 114.0579 },
  '杭州': { lat: 30.2741, lon: 120.1551 },
  '成都': { lat: 30.5728, lon: 104.0668 },
  '武汉': { lat: 30.5928, lon: 114.3055 },
  '南京': { lat: 32.0603, lon: 118.7969 },
  '西安': { lat: 34.3416, lon: 108.9398 },
  '长沙': { lat: 28.2282, lon: 112.9388 },
  '郑州': { lat: 34.7466, lon: 113.6253 },
  '济南': { lat: 36.6512, lon: 116.9946 },
  '青岛': { lat: 36.0671, lon: 120.3826 },
  '石家庄': { lat: 38.0428, lon: 114.5149 },
  '太原': { lat: 37.8706, lon: 112.5489 },
  '沈阳': { lat: 41.8057, lon: 123.4315 },
  '大连': { lat: 38.9140, lon: 121.6147 },
  '长春': { lat: 43.8171, lon: 125.3235 },
  '哈尔滨': { lat: 45.8038, lon: 126.5350 },
  '合肥': { lat: 31.8206, lon: 117.2272 },
  '福州': { lat: 26.0745, lon: 119.2965 },
  '厦门': { lat: 24.4798, lon: 118.0894 },
  '南昌': { lat: 28.6820, lon: 115.8579 },
  '南宁': { lat: 22.8170, lon: 108.3665 },
  '海口': { lat: 20.0174, lon: 110.3492 },
  '贵阳': { lat: 26.6470, lon: 106.6302 },
  '昆明': { lat: 25.0389, lon: 102.7183 },
  '拉萨': { lat: 29.6500, lon: 91.1000 },
  '兰州': { lat: 36.0611, lon: 103.8343 },
  '西宁': { lat: 36.6171, lon: 101.7785 },
  '银川': { lat: 38.4872, lon: 106.2309 },
  '呼和浩特': { lat: 40.8424, lon: 111.7490 },
  '乌鲁木齐': { lat: 43.8256, lon: 87.6168 },
  // 常见地级市
  '苏州': { lat: 31.2990, lon: 120.5853 },
  '无锡': { lat: 31.4912, lon: 120.3124 },
  '宁波': { lat: 29.8683, lon: 121.5440 },
  '温州': { lat: 28.0015, lon: 120.6988 },
  '东莞': { lat: 23.0208, lon: 113.7518 },
  '佛山': { lat: 23.0215, lon: 113.1214 },
  '珠海': { lat: 22.2707, lon: 113.5767 },
  '惠州': { lat: 23.1120, lon: 114.4168 },
  '中山': { lat: 22.5168, lon: 113.3926 },
  '三亚': { lat: 18.2528, lon: 109.5120 },
  '桂林': { lat: 25.2736, lon: 110.2900 },
  '洛阳': { lat: 34.6181, lon: 112.4536 },
  '徐州': { lat: 34.2056, lon: 117.2841 },
  '烟台': { lat: 37.4645, lon: 121.4480 },
  '威海': { lat: 37.5131, lon: 122.1204 },
  '扬州': { lat: 32.3942, lon: 119.4129 },
  '绍兴': { lat: 30.0297, lon: 120.5802 },
  '嘉兴': { lat: 30.7710, lon: 120.7555 },
};

function normalizeCity(city: string): string {
  // 去掉"市"后缀
  let name = city.replace(/市$/, '');
  // 模糊匹配
  if (CITY_COORDS[name]) return name;
  for (const key of Object.keys(CITY_COORDS)) {
    if (name.includes(key) || key.includes(name)) return key;
  }
  return '北京'; // 默认
}

interface WeatherResult {
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
}

function weatherCodeToText(code: number, ct: ContentBundle): string {
  const map = ct.weather_conditions || {};
  if (code <= 1) return map['0'] || '晴朗';
  if (code <= 3) return map['1'] || '多云';
  if (code <= 48) return map['3'] || '雾/霾';
  if (code <= 57) return map['4'] || '毛毛雨';
  if (code <= 67) return map['5'] || '下雨';
  if (code <= 77) return map['6'] || '下雪';
  if (code <= 82) return map['7'] || '阵雨';
  if (code <= 86) return map['8'] || '阵雪';
  if (code <= 95) return map['9'] || '雷阵雨';
  return map['10'] || '恶劣天气';
}

export async function handler(args: Record<string, any>): Promise<string> {
  const ct: ContentBundle = await readContent();
  const cityName = normalizeCity(args.city || '北京');
  const coords = CITY_COORDS[cityName];

  if (!coords) {
    return JSON.stringify({
      city: cityName,
      temperature: 25,
      condition: ct.weather_fallback || '晴朗（默认值）',
      humidity: 60,
      windSpeed: 10,
      note: '城市坐标未缓存，返回默认值',
    });
  }

  try {
    const url = `${WEATHER_API}?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true&timezone=Asia/Shanghai`;
    const resp = await fetch(url);
    const data = await resp.json() as any;
    const cw = data.current_weather;

    if (!cw) throw new Error('天气数据不可用');

    const temp = Math.round(cw.temperature);
    const condition = weatherCodeToText(cw.weathercode, ct);
    const humidity = cw.relativehumidity_2m || 60;
    const windSpeed = Math.round(cw.windspeed || 0);

    const catNotes = ct.weather_catNotes || {};
    return JSON.stringify({
      city: cityName,
      temperature: temp,
      condition,
      humidity,
      windSpeed,
      catNote: temp > 35 ? (catNotes.hot || '太热了！本喵要化了喵...')
        : temp > 30 ? (catNotes.warm || '有点热，本喵只想摊在地上')
        : temp < 5 ? (catNotes.cold || '冷死了！本喵要钻被窝')
        : temp < 12 ? (catNotes.cool || '有点凉，适合本喵跑酷取暖')
        : (catNotes.pleasant || '温度舒适，适合趴窗台看鸟'),
      rainWarning: condition.includes('雨') ? (ct.weather_rainWarning || '下雨天，提醒两脚兽带伞喵~') : null,
    });
  } catch {
    return JSON.stringify({
      city: cityName,
      temperature: 25,
      condition: ct.weather_fallback || '晴朗（默认值）',
      humidity: 60,
      windSpeed: 10,
      error: ct.weather_serviceDown || '天气服务暂不可用',
    });
  }
}
