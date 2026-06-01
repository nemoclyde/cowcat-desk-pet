/**
 * 语料库搜索工具 — search_corpus
 * 从用户配置的语料库中搜索相关内容
 */

import { kvCorpus, listKeysCompat, readJSONCompat, KEY_PREFIX } from '../kv';

export const corpusSearchTool = {
  name: 'search_corpus',
  description: '从语料库中搜索相关内容。语料库包含奶牛猫常用的梗、段子、口头禅等。当你想找一些有趣的说法或特定的梗时使用。',
  parameters: {
    keyword: {
      type: 'string',
      description: '搜索关键词，如"吐槽"、"撒娇"、"节日"、"天气"、"深夜"',
    },
  } as Record<string, any>,
};

interface CorpusEntry {
  id: string;
  category: string;
  content: string;
  keywords: string[];
  weight: number;
}

export async function handler(args: Record<string, any>): Promise<string> {
  const keyword = (args.keyword || '').toLowerCase();

  try {
    const keys = await listKeysCompat(kvCorpus, KEY_PREFIX.CORPUS, 200);
    const entries: CorpusEntry[] = [];

    for (const key of keys) {
      const entry = await readJSONCompat<CorpusEntry>(kvCorpus, key);
      if (entry) entries.push(entry);
    }

    if (entries.length === 0) {
      return JSON.stringify({
        found: 0,
        results: [],
        message: '语料库为空，主人还没添加语料呢喵~',
      });
    }

    // 搜索匹配
    let matched = entries.filter(e => {
      const searchTarget = [
        e.category,
        e.content,
        ...(e.keywords || []),
      ].join(' ').toLowerCase();
      return searchTarget.includes(keyword);
    });

    // 如果没匹配到，返回一些随机语料（按权重）
    if (matched.length === 0) {
      matched = entries
        .sort((a, b) => (b.weight || 1) - (a.weight || 1))
        .slice(0, 5);
    }

    // 按权重排序，最多返回10条
    const results = matched
      .sort((a, b) => (b.weight || 1) - (a.weight || 1))
      .slice(0, 10)
      .map(e => ({
        category: e.category,
        content: e.content,
      }));

    return JSON.stringify({
      found: results.length,
      keyword,
      results,
    });
  } catch (err: any) {
    return JSON.stringify({
      found: 0,
      results: [],
      error: '语料库搜索失败: ' + (err.message || '未知错误'),
    });
  }
}
