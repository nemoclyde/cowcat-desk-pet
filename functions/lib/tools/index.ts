/**
 * 工具注册中心
 *
 * 扩展方法：新建 tools/xxx.ts，实现 ToolPlugin 接口，在此处 TOOLS 数组注册
 * 豆包自动获得新工具的调用能力
 */

import { timeTool, handler as timeHandler } from './time';
import { weatherTool, handler as weatherHandler } from './weather';
import { holidayTool, handler as holidayHandler } from './holiday';
import { corpusSearchTool, handler as corpusSearchHandler } from './corpus-search';

// ---- 工具插件接口 ----

export interface ToolPlugin {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: Record<string, any>) => Promise<string>;
}

// ---- 注册所有工具 ----

export const ALL_TOOLS: ToolPlugin[] = [
  {
    name: timeTool.name,
    description: timeTool.description,
    parameters: timeTool.parameters,
    handler: timeHandler,
  },
  {
    name: weatherTool.name,
    description: weatherTool.description,
    parameters: weatherTool.parameters,
    handler: weatherHandler,
  },
  {
    name: holidayTool.name,
    description: holidayTool.description,
    parameters: holidayTool.parameters,
    handler: holidayHandler,
  },
  {
    name: corpusSearchTool.name,
    description: corpusSearchTool.description,
    parameters: corpusSearchTool.parameters,
    handler: corpusSearchHandler,
  },
  // ==========================================
  // === 未来扩展点：在这里注册新工具即可 ===
  // ==========================================
];

// ---- 工具定义（给豆包看）----

export function getToolDefinitions() {
  return ALL_TOOLS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object' as const,
        properties: t.parameters,
        required: Object.keys(t.parameters),
      },
    },
  }));
}

// ---- 工具处理器映射 ----

export function getToolHandlers(): Map<string, (args: Record<string, any>) => Promise<string>> {
  const map = new Map<string, (args: Record<string, any>) => Promise<string>>();
  for (const tool of ALL_TOOLS) {
    map.set(tool.name, tool.handler);
  }
  return map;
}
