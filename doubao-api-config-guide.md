# 豆包 Responses API — 奶牛猫桌宠配置指南

> 精简版，只保留奶牛猫项目实际用到的参数和配置。

---

## 一、API 端点

```
Base URL:  https://ark.cn-beijing.volces.com/api/v3
Endpoint:  POST /responses
鉴权方式:  Authorization: Bearer {API_KEY}
```

API Key 获取：火山方舟控制台 → [API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)

---

## 二、当前项目的请求参数

项目中 `functions/lib/doubao.ts` 实际使用的字段：

| 参数 | 当前值 | 说明 |
|------|--------|------|
| `model` | `doubao-seed-2-0-lite-260215` | 默认模型，可在设置页修改 |
| `max_output_tokens` | 256 | 输出上限，1-3句猫语 256 足够 |
| `thinking` | `{ type: "disabled" }` | 关闭深度思考，节省 Token 成本 |
| `tools[0].type` | `web_search` | 联网搜索（天气/新闻等实时信息） |
| `tools[0].max_keyword` | 1 | 并行搜索关键词数，1=最低成本 |
| `tools[0].limit` | 5 | 单次搜索最大召回条数 |
| `tools[0].sources` | 未设置 | 不附加付费源（仅默认搜索引擎） |
| `tools[0].user_location` | `{ type: "approximate", ... }` | 用户城市，优化搜索结果 |

---

## 三、成本控制参数（已启用）

### 3.1 max_output_tokens

限制模型输出的最大 token 数（含思维链）。奶牛猫只说 1-3 句俏皮话，256 足够。

```json
{ "max_output_tokens": 256 }
```

### 3.2 thinking: disabled

关闭深度思考模式。桌宠不需要深度推理，关闭后响应更快、成本更低。

```json
{ "thinking": { "type": "disabled" } }
```

可选值：`enabled`（一定先思考再答）、`disabled`（不思考）、`auto`（模型自行判断）。

### 3.3 web_search 限流参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `max_keyword` | 1 | 每次只搜 1 个关键词（最低成本） |
| `limit` | 5 | 最多返回 5 条结果 |

---

## 四、参数注意事项

1. **Seed 2.0 模型忽略 temperature/top_p**：`doubao-seed-2-0-pro` 和 `doubao-seed-2-0-lite` 温度固定为 1，top_p 固定为 0.95，手动设置会被忽略。

2. **instructions 不兼容缓存**：设置 `instructions` 后无法使用上下文缓存（`caching`）。

3. **web_search sources 附加源**：
   - `toutiao` — 头条图文
   - `douyin` — 抖音百科
   - `moji` — 墨迹天气（当前项目已启用）

4. **模型支持的推理 effort**（仅部分模型如 `deepseek-v4-pro` 支持）：
   - `minimal` / `low` / `medium` / `high` / `max`

---

## 五、响应参数

- 非流式调用返回一个 [Response Object](https://www.volcengine.com/docs/82379/1783703)
- 流式调用返回 SSE 事件流
- 当前项目使用非流式，响应中包含 `output` 数组（可含 web_search_call、web_search_call_result、output_text 等）

---

## 六、错误码

| 状态码 | 含义 | 排查 |
|--------|------|------|
| 401 | 鉴权失败 | 检查 API Key 是否有效 |
| 403 | 无权限 | 确认已开通模型服务，余额充足 |
| 429 | 限流 | 降低并发或升级配额 |
| 500 | 服务端错误 | 重试或联系技术支持 |

---

## 七、官方资源

- [火山方舟控制台](https://console.volcengine.com/ark)
- [Responses API 文档](https://www.volcengine.com/docs/82379/1569618)
- [模型列表](https://www.volcengine.com/docs/82379/1330310)
- [Web Search 联网搜索文档](https://www.volcengine.com/docs/82379/1756990)
- [模型计费](https://www.volcengine.com/docs/82379/1544106)
