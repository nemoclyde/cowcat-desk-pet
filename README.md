# 🐱 奶牛猫桌宠 — AI 语音代理平台

基于腾讯 EdgeOne + 火山引擎豆包大模型，为桌宠提供智能对话文字输出。

## 项目结构

```
cowcat-desk-pet/
├── frontend/          # React + Ant Design 管理后台
├── functions/         # EdgeOne Functions (API层)
│   ├── api/           # 接口端点
│   │   ├── speak.ts           # GET  /api/speak (公开)
│   │   ├── internal/          # 内部接口(SCF触发)
│   │   └── admin/             # 管理接口(需鉴权)
│   └── lib/           # 公共库
│       ├── doubao.ts          # 豆包 API 封装 (Responses API)
│       ├── cat-prompt.ts      # 奶牛猫 prompt 构建器
│       ├── auth.ts            # JWT + 密码哈希
│       ├── kv.ts              # KV 存储抽象
│       └── tools/             # 上下文收集工具
├── scf/               # SCF 定时触发器
└── edgeone.json       # EdgeOne 部署配置
```

## 快速开始

### 前置条件

1. **EdgeOne Pages** 项目（在 https://console.cloud.tencent.com/edgeone 创建）
2. **火山引擎豆包 API Key**（在 https://console.volcengine.com/ark 获取）
3. **Node.js 18+**

### 本地开发

```bash
# 1. 进入项目
cd cowcat-desk-pet

# 2. 安装前端依赖
cd frontend && npm install

# 3. 启动前端开发服务器
npm run dev
# → 访问 http://localhost:3000/admin

# 4. 设置环境变量
export DOUBAO_API_KEY="your-api-key-here"
export DEFAULT_ADMIN_PASSWORD="your-admin-password"
```

### 部署到 EdgeOne

1. 在 EdgeOne Pages 控制台创建项目，关联 Git 仓库
2. 配置 KV 命名空间：
   - `CACHE` → `cowcat-cache`
   - `PROMPTS` → `cowcat-prompts`
   - `CORPUS` → `cowcat-corpus`
   - `SETTINGS` → `cowcat-settings`
   - `LOGS` → `cowcat-logs`
3. 配置环境变量：
   - `DOUBAO_API_KEY`：豆包 API Key
   - `DEFAULT_ADMIN_PASSWORD`：管理后台默认密码
4. 部署

### SCF 定时触发器

```bash
# 在腾讯云 SCF 控制台创建云函数
# 运行时: Node.js 18+
# 代码: scf/index.js
# 环境变量: EDGEONE_URL=https://your-project.edgeone.app
# 触发器: Timer Trigger，cron 表达式如 "*/10 * * * *" (每10分钟)
```

## API 文档

### 公开接口

**GET /api/speak** — 获取奶牛猫当前话语

```bash
curl https://your-project.edgeone.app/api/speak
```

```json
{
  "text": "喵~ 都凌晨一点了还不睡觉！本喵都困死了...",
  "mood": "傲娇",
  "generatedAt": "2026-05-29T01:05:00+08:00",
  "context": {
    "time": "凌晨 1:05",
    "weather": "多云 24°C",
    "holiday": "无"
  }
}
```

### 管理接口

所有 `/api/admin/*` 需要 Bearer token 鉴权。

1. `POST /api/admin/auth` — 登录（获取 token）
2. `PUT /api/admin/password` — 修改密码
3. `CRUD /api/admin/prompts` — 提示词管理
4. `CRUD /api/admin/corpus` — 语料库管理
5. `GET/PUT /api/admin/settings` — 全局设置
6. `POST /api/admin/generate` — 手动触发生成
7. `GET /api/admin/logs` — 日志查询
8. `GET /api/admin/logs/export` — 日志导出

## 扩展开发

### 添加新工具

在 `functions/lib/tools/` 新建文件，然后在 `index.ts` 注册：

```ts
// 1. 新建 functions/lib/tools/news.ts
export const newsTool = {
  name: 'get_daily_news',
  description: '获取今日新闻',
  parameters: { category: { type: 'string', description: '分类' } },
};
export async function handler(args) {
  return JSON.stringify(await fetchNews(args.category));
}

// 2. 在 index.ts ALL_TOOLS 注册
import { newsTool, handler as newsHandler } from './news';
// ALL_TOOLS.push({ ...newsTool, handler: newsHandler });
```

### 添加管理后台页面

在 `frontend/src/pages/` 新建 `.tsx`，然后在 `App.tsx` 路由注册即可。
