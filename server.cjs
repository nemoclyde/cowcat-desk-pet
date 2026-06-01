/**
 * 本地开发 API 服务器
 * 模拟 EdgeOne Functions，使用内存 KV
 *
 * 用法: node server.cjs
 * 然后 npm run dev 启动前端，API 请求代理到此服务器 (端口 8788)
 */

const http = require('http');
const crypto = require('crypto');

// ---- 内存 KV 存储 ----
const kv = {
  CACHE: new Map(),
  PROMPTS: new Map(),
  CORPUS: new Map(),
  SETTINGS: new Map(),
  LOGS: new Map(),
};

// ---- 简易密码哈希 ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  return computed === hash;
}

// ---- JWT ----
const jwtSecret = crypto.randomBytes(32).toString('hex');

function signToken(type) {
  const payload = { sub: 'admin', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + (type === 'access' ? 7200 : 604800), type };
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', jwtSecret).update(header+'.'+body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', jwtSecret).update(header+'.'+body).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}

function requireAuth(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const payload = verifyToken(auth.slice(7));
  return payload && payload.type === 'access';
}

// ---- CORS ----
function corsHeaders(methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(res, data, status = 200, extraHeaders = {}) {
  res.writeHead(status, { ...corsHeaders(), ...extraHeaders });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// ---- KV 辅助 ----
function getKV(ns) {
  const store = kv[ns] || new Map();
  const prefix = ns + ':';
  return {
    get: (key) => {
      const entry = store.get(prefix + key);
      return entry ? entry.value : null;
    },
    put: (key, value) => store.set(prefix + key, { value, metadata: {} }),
    delete: (key) => store.delete(prefix + key),
    list: (p) => {
      const fullPrefix = prefix + (p?.prefix || '');
      const keys = Array.from(store.keys())
        .filter(k => k.startsWith(fullPrefix))
        .map(k => ({ name: k.slice(prefix.length), metadata: store.get(k)?.metadata || {} }));
      const limit = p?.limit || 1000;
      const startIdx = p?.cursor ? parseInt(p.cursor) : 0;
      const sliced = keys.slice(startIdx, startIdx + limit);
      return { keys: sliced, list_complete: startIdx + limit >= keys.length, cursor: sliced.length === limit ? String(startIdx + limit) : undefined };
    },
  };
}

// ---- 豆包 API mock ----
async function mockCatGenerate(_prompt) {
  const contexts = [
    { text: '喵~ 现在是测试环境喵！本喵还没连上豆包，但很快就会了喵~', mood: '撒娇' },
    { text: '哼！两脚兽又在折腾代码了...不过本喵原谅你了，因为你是我的铲屎官喵~', mood: '傲娇' },
    { text: '呼噜呼噜...本喵刚打了个盹，梦到吃不完的罐头，然后就醒了喵...', mood: '慵懒' },
    { text: '嗷！！本喵突然想跑酷！从桌子跳到柜子再跳到窗台！嘭！（撞到头了）喵...', mood: '疯癫' },
    { text: '夜深了喵...两脚兽还在加班吗？要不要本喵趴你键盘上帮你...暖和一下？', mood: '关心' },
  ];
  const pick = contexts[Math.floor(Math.random() * contexts.length)];
  return {
    text: pick.text, mood: pick.mood, tokensUsed: 120,
    responseId: 'mock_' + Date.now().toString(36),
    searchesUsed: 0, searchQueries: [],
    _rawRequest: {
      model: 'doubao-seed-2-0-lite-260215 (mock)',
      max_output_tokens: 256,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: _prompt }] }],
    },
    _rawResponse: {
      id: 'mock_resp_' + Date.now().toString(36),
      model: 'doubao-seed-2-0-lite-260215 (mock)',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: pick.text }] }],
      usage: { input_tokens: Math.floor(_prompt.length / 2), output_tokens: pick.text.length, total_tokens: Math.floor(_prompt.length / 2) + pick.text.length },
    },
    _fullOutput: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: pick.text }] }],
  };
}

// 带上下文的 mock 生成（用于 /api/speak 自动刷新）
async function mockCatGenerateWithContext() {
  const settingsKV = getKV('SETTINGS');
  const generalRaw = settingsKV.get('general');
  const general = generalRaw ? JSON.parse(generalRaw) : {};
  const city = general.weatherCity || '北京';

  // 读取激活的提示词
  const promptsKV = getKV('PROMPTS');
  const promptList = promptsKV.list({ prefix: 'prompt_' });
  let promptName = '默认人设';
  for (const k of promptList.keys) {
    try {
      const p = JSON.parse(promptsKV.get(k.name));
      if (p && p.isActive) { promptName = p.name || '未命名'; break; }
    } catch {}
  }

  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const hour = now.getHours();

  // 根据时间生成更自然的 mock 回复
  let text, mood;
  if (hour < 6) {
    text = 'zzz...呼噜呼噜...（本喵睡得正香呢，两脚兽怎么还不睡喵...）';
    mood = '慵懒';
  } else if (hour < 9) {
    text = `早安喵~ ${city}的早晨真舒服...两脚兽快起床！本喵的罐头要饿扁了喵！`;
    mood = '撒娇';
  } else if (hour < 12) {
    text = '喵~ 本喵正在窗边晒太阳，看外面的小鸟飞来飞去...好想抓一只喵！';
    mood = '开心';
  } else if (hour < 18) {
    text = '哼！两脚兽上班去了都不陪我玩...那本喵就睡一下午觉好了喵~';
    mood = '傲娇';
  } else if (hour < 22) {
    text = '嗷！！晚上才是猫的主场！本喵要在家里跑酷！！嘭！（撞到椅子了）喵...';
    mood = '疯癫';
  } else {
    text = `夜深了喵...${city}的晚上好安静。两脚兽还在忙吗？要不要休息一下？本喵陪你喵~`;
    mood = '关心';
  }

  return {
    text, mood, tokensUsed: 100,
    responseId: 'mock_auto_' + Date.now().toString(36),
    searchesUsed: 0, searchQueries: [],
    _rawRequest: { model: 'mock', max_output_tokens: 256 },
    _rawResponse: { id: 'mock_auto', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] },
    _fullOutput: [{ type: 'message', content: [{ type: 'output_text', text }] }],
  };
}

// ---- 路由处理 ----
async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, corsHeaders());
    res.end();
    return;
  }

  try {
    // === 诊断端点（无鉴权）===
    if (path === '/api/ping' && method === 'GET') {
      return json(res, { ok: true, time: new Date().toISOString() });
    }

    if (path === '/api/debug' && method === 'GET') {
      const results = [
        { step: '1. basic-response', status: 'ok', detail: '本地服务器正常运行' },
        { step: '2. kv-stores', status: 'ok', detail: '内存 KV 已初始化' },
        { step: '3. auth', status: 'ok', detail: 'JWT 模块正常' },
      ];
      return json(res, {
        summary: '全部通过 ✅ (本地模式)',
        total: results.length,
        passed: results.length,
        failed: 0,
        results,
      });
    }

    // === 公开接口 ===
    if (path === '/api/speak' && method === 'GET') {
      const cacheKV = getKV('CACHE');
      const settingsKV = getKV('SETTINGS');
      const cachedRaw = cacheKV.get('current');
      const cached = cachedRaw ? JSON.parse(cachedRaw) : null;

      // 检查缓存是否过期
      const generalRaw = settingsKV.get('general');
      const general = generalRaw ? JSON.parse(generalRaw) : {};
      const intervalMin = general.generateInterval || 10;
      let stale = true;
      if (cached?.generatedAt) {
        const ageMs = Date.now() - new Date(cached.generatedAt).getTime();
        stale = ageMs > intervalMin * 60 * 1000;
      }

      // 背景刷新函数（fire-and-forget，不阻塞响应，防并发）
      let _bgRefreshing = false;
      function bgRefresh() {
        if (_bgRefreshing) return;
        _bgRefreshing = true;
        mockCatGenerateWithContext().then(result => {
          const entry = {
            text: result.text, mood: result.mood,
            responseId: result.responseId, generatedAt: new Date().toISOString(),
            context: { prompt: '(自动刷新)', promptName: '自动刷新' },
          };
          cacheKV.put('current', JSON.stringify(entry));
          const histRaw = cacheKV.get('history');
          const history = histRaw ? JSON.parse(histRaw) : [];
          history.unshift(entry);
          if (history.length > (general.maxHistoryCache || 50)) history.length = general.maxHistoryCache || 50;
          cacheKV.put('history', JSON.stringify(history));
          // 写日志 + 清理
          const logKV = getKV('LOGS');
          const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          logKV.put('log_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15) + '_' + logId, JSON.stringify({
            id: logId, timestamp: new Date().toISOString(),
            input: { userPrompt: '(自动刷新)', systemPrompt: '-', promptName: '自动刷新', fullPrompt: '-' },
            output: { text: result.text, mood: result.mood, tokensUsed: 0, latencyMs: 0 },
            trigger: 'auto',
          }));
          try {
            const logKeys = logKV.list({ prefix: 'log_' }).keys.map(k => k.name);
            const maxLog = general.maxLogCount || general.logRetentionDays || 100;
            if (logKeys.length > maxLog) {
              logKeys.sort();
              logKeys.slice(0, logKeys.length - maxLog).forEach(k => logKV.delete(k));
            }
          } catch {}
        }).catch(() => {}).finally(() => { _bgRefreshing = false; });
      }

      // 缓存新鲜 → 直接返回
      if (cached?.text && !stale) {
        return json(res, { text: cached.text, mood: cached.mood, generatedAt: cached.generatedAt, context: cached.context });
      }

      // 缓存过期 → 返回旧缓存，触发背景刷新
      if (cached?.text && stale) {
        bgRefresh();
        return json(res, { text: cached.text, mood: cached.mood, generatedAt: cached.generatedAt, context: { ...cached.context, refreshing: true } });
      }

      // 无缓存 → 返回默认文本，触发背景生成
      bgRefresh();
      return json(res, {
        text: '喵~ 本喵刚睡醒，还没想好要说什么... 等下再问我吧！',
        mood: '慵懒', generatedAt: new Date().toISOString(),
        context: { init: true }, cached: false,
      });
    }

    // === 鉴权接口 ===
    if (path === '/api/admin/auth' && method === 'POST') {
      const body = await readBody(req);
      const { password } = body;
      if (!password) return json(res, { error: '请输入密码' }, 400);

      const settingsKV = getKV('SETTINGS');
      let authData = settingsKV.get('auth');

      const defaultPwd = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

      if (!authData) {
        if (password === defaultPwd) {
          const hash = hashPassword(password);
          settingsKV.put('auth', JSON.stringify({ passwordHash: hash }));
          authData = JSON.stringify({ passwordHash: hash });
        } else {
          return json(res, { error: '密码错误' }, 401);
        }
      }

      const { passwordHash } = JSON.parse(authData);
      if (!verifyPassword(password, passwordHash)) {
        return json(res, { error: '密码错误' }, 401);
      }

      const token = signToken('access');
      const refreshToken = signToken('refresh');
      return json(res, { token, refreshToken });
    }

    if (path === '/api/admin/auth/refresh' && method === 'POST') {
      const body = await readBody(req);
      const payload = verifyToken(body.refreshToken);
      if (!payload || payload.type !== 'refresh') {
        return json(res, { error: 'refreshToken 无效或已过期' }, 401);
      }
      return json(res, { token: signToken('access'), refreshToken: signToken('refresh') });
    }

    // === 需要鉴权的接口 ===
    if (path.startsWith('/api/admin/')) {
      if (!requireAuth(req)) {
        return json(res, { error: '未授权' }, 401);
      }

      // ---- 内容管理 ----
      if (path === '/api/admin/content' && method === 'GET') {
        const defaults = {
          toolDesc_time: '获取当前日期和时间信息', toolDesc_weather: '获取指定城市的实时天气信息',
          toolDesc_weather_param: '城市名称', toolDesc_holiday: '获取今天的节日信息',
          toolDesc_corpusSearch: '从语料库中搜索相关内容', toolDesc_corpusSearch_param: '搜索关键词',
          weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
          periods: ['凌晨', '早上', '上午', '中午', '下午', '傍晚', '晚上', '深夜'],
          time_isWeekend: '今天是周末，主人可能在家', time_isWeekday: '今天是工作日',
          weather_conditions: { '0': '晴朗', '1': '多云', '2': '阴天', '3': '雾/霾', '4': '毛毛雨', '5': '下雨', '6': '下雪', '7': '阵雨', '8': '阵雪', '9': '雷阵雨', '10': '恶劣天气' },
          weather_catNotes: { hot: '太热了！本喵要化了喵...', warm: '有点热，本喵只想摊在地上', cold: '冷死了！本喵要钻被窝', cool: '有点凉，适合本喵跑酷取暖', pleasant: '温度舒适，适合趴窗台看鸟' },
          weather_rainWarning: '下雨天，提醒两脚兽带伞喵~', weather_fallback: '晴朗（默认值）', weather_serviceDown: '天气服务暂不可用',
          holiday_names: {}, holiday_catMessages: {}, holiday_noHoliday: '无特别节日', holiday_weekend: '周末休息日',
          fallback_emptyResponse: '（本喵走神了...没想好说什么喵~）',
          fallback_noSpeakCache: '喵~ 本喵刚睡醒，还没想好要说什么... 等下再问我吧！',
          fallback_speakError: '喵？出错了...本喵也不知道发生了什么喵...',
          fallback_defaultSystemPrompt: '你是叫小斑的奶牛猫，住在主人电脑桌面上，性格慵懒傲娇又黏人。自称"本喵"，叫主人"两脚兽"或"铲屎的"。回复时带喵~、哼！、嗷！等猫语气词。',
          fallback_defaultUserPrompt: '请根据当前时间，以奶牛猫的口吻说几句话。可以适当吐槽主人，表达当下的心情。',
          searchRules: '- 如果回复涉及实时信息（天气、新闻、热点事件、具体事实数据等），请使用 web_search 搜索\n- 如果是日常闲聊、撒娇、吐槽、心情抒发等不需要实时数据的内容，不要搜索\n- 上下文中已提供了时间等基础信息，无需为此搜索',
        };
        const settingsKV = getKV('SETTINGS');
        const storedRaw = settingsKV.get('content_bundle');
        const stored = storedRaw ? JSON.parse(storedRaw) : {};
        return json(res, { content: stored, defaults });
      }

      if (path === '/api/admin/content' && method === 'PUT') {
        const body = await readBody(req);
        if (!body.content || typeof body.content !== 'object') {
          return json(res, { error: '缺少 content 字段' }, 400);
        }
        getKV('SETTINGS').put('content_bundle', JSON.stringify(body.content));
        return json(res, { success: true, content: body.content });
      }

      // test-crud
      if (path === '/api/admin/test-crud' && method === 'GET') {
        const settingsKV = getKV('SETTINGS');
        const settings = settingsKV.get('general');
        return json(res, { ok: true, authed: true, hasSettings: settings !== null });
      }

      // 修改密码
      if (path === '/api/admin/password' && method === 'PUT') {
        const body = await readBody(req);
        const settingsKV = getKV('SETTINGS');
        const authData = settingsKV.get('auth');
        if (authData) {
          const { passwordHash } = JSON.parse(authData);
          if (!verifyPassword(body.oldPassword, passwordHash)) {
            return json(res, { error: '旧密码错误' }, 403);
          }
        }
        if (!body.newPassword || body.newPassword.length < 4) {
          return json(res, { error: '新密码至少4位' }, 400);
        }
        const newHash = hashPassword(body.newPassword);
        settingsKV.put('auth', JSON.stringify({ passwordHash: newHash }));
        return json(res, { success: true, message: '密码修改成功' });
      }

      // ---- 提示词 CRUD ----
      if (path === '/api/admin/prompts' && method === 'GET') {
        const promptsKV = getKV('PROMPTS');
        const result = promptsKV.list({ prefix: 'prompt_' });
        const prompts = result.keys.map(k => {
          try { return JSON.parse(promptsKV.get(k.name)); } catch { return null; }
        }).filter(Boolean);
        prompts.sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''));
        return json(res, prompts);
      }

      if (path === '/api/admin/prompts' && method === 'POST') {
        const body = await readBody(req);
        const id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        const prompt = {
          id, name: body.name || '未命名', systemPrompt: body.systemPrompt || '',
          userPromptTemplate: body.userPromptTemplate || '', temperature: body.temperature ?? 0.9,
          maxTokens: body.maxTokens || 512, isActive: body.isActive ?? false,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        getKV('PROMPTS').put('prompt_' + id, JSON.stringify(prompt));
        return json(res, prompt, 201);
      }

      // PUT/DELETE: 优先从 query string 取 id，兼容旧 URL 路径格式
      const promptMatch = path.match(/^\/api\/admin\/prompts\/(.+)/);
      const promptQueryId = url.searchParams.get('id');
      const promptIdFromUrl = promptMatch ? decodeURIComponent(promptMatch[1]) : null;
      if ((promptQueryId || promptMatch) && method === 'PUT') {
        const id = decodeURIComponent(promptQueryId || promptMatch[1]);
        console.log(`[server] PUT /api/admin/prompts id=${id} (query=${!!promptQueryId} url=${!!promptMatch})`);
        const promptsKV = getKV('PROMPTS');
        const existing = promptsKV.get('prompt_' + id);
        if (!existing) return json(res, { error: '提示词不存在' }, 404);
        const body = await readBody(req);
        console.log(`[server] 更新提示词 body keys:`, Object.keys(body));
        const updated = { ...JSON.parse(existing), ...body, updatedAt: new Date().toISOString() };
        promptsKV.put('prompt_' + id, JSON.stringify(updated));
        console.log(`[server] 提示词已更新:`, id);
        return json(res, updated);
      }
      if ((promptQueryId || promptMatch) && method === 'DELETE') {
        const id = decodeURIComponent(promptQueryId || promptMatch[1]);
        console.log(`[server] DELETE /api/admin/prompts id=${id} (query=${!!promptQueryId} url=${!!promptMatch})`);
        getKV('PROMPTS').delete('prompt_' + id);
        console.log(`[server] 提示词已删除:`, id);
        return json(res, { success: true });
      }

      // ---- 语料库 CRUD ----
      if (path === '/api/admin/corpus' && method === 'GET') {
        const corpusKV = getKV('CORPUS');
        const result = corpusKV.list({ prefix: 'corpus_'});
        const items = result.keys.map(k => {
          try { return JSON.parse(corpusKV.get(k.name)); } catch { return null; }
        }).filter(Boolean);
        const category = url.searchParams.get('category');
        const keyword = url.searchParams.get('keyword');
        let filtered = items;
        if (category) filtered = filtered.filter(e => e.category === category);
        if (keyword) {
          const kw = keyword.toLowerCase();
          filtered = filtered.filter(e => e.content.toLowerCase().includes(kw) || (e.keywords||[]).some(k => k.toLowerCase().includes(kw)));
        }
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = parseInt(url.searchParams.get('pageSize') || '50');
        const start = (page-1)*pageSize;
        return json(res, { items: filtered.slice(start, start+pageSize), total: filtered.length, page, pageSize });
      }

      if (path === '/api/admin/corpus' && method === 'POST') {
        const body = await readBody(req);
        const corpusKV = getKV('CORPUS');
        if (body.batch && Array.isArray(body.items)) {
          let count = 0;
          for (const item of body.items) {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '_' + count;
            corpusKV.put('corpus_'+ id, JSON.stringify({
              id, category: item.category||'日常', content: item.content||'',
              keywords: item.keywords||[], weight: item.weight||1, createdAt: new Date().toISOString(),
            }));
            count++;
          }
          return json(res, { success: true, count }, 201);
        }
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const entry = {
          id, category: body.category||'日常', content: body.content||'',
          keywords: body.keywords||[], weight: body.weight||1, createdAt: new Date().toISOString(),
        };
        corpusKV.put('corpus_'+ id, JSON.stringify(entry));
        return json(res, entry, 201);
      }

      // PUT/DELETE: 优先从 query string 取 id，兼容旧 URL 路径格式
      const corpusMatch = path.match(/^\/api\/admin\/corpus\/(.+)/);
      const corpusQueryId = url.searchParams.get('id');
      if ((corpusQueryId || corpusMatch) && method === 'PUT') {
        const id = decodeURIComponent(corpusQueryId || corpusMatch[1]);
        console.log(`[server] PUT /api/admin/corpus id=${id} (query=${!!corpusQueryId} url=${!!corpusMatch})`);
        const corpusKV = getKV('CORPUS');
        const existing = corpusKV.get('corpus_'+ id);
        if (!existing) return json(res, { error: '语料不存在' }, 404);
        const body = await readBody(req);
        console.log(`[server] 更新语料 body keys:`, Object.keys(body));
        const oldData = JSON.parse(existing);
        const updated = {
          ...oldData,
          category: body.category ?? oldData.category,
          content: body.content ?? oldData.content,
          keywords: body.keywords ?? oldData.keywords,
          weight: body.weight ?? oldData.weight,
          updatedAt: new Date().toISOString(),
        };
        corpusKV.put('corpus_'+ id, JSON.stringify(updated));
        console.log(`[server] 语料已更新:`, id);
        return json(res, updated);
      }
      if ((corpusQueryId || corpusMatch) && method === 'DELETE') {
        const id = decodeURIComponent(corpusQueryId || corpusMatch[1]);
        console.log(`[server] DELETE /api/admin/corpus id=${id} (query=${!!corpusQueryId} url=${!!corpusMatch})`);
        getKV('CORPUS').delete('corpus_'+ id);
        console.log(`[server] 语料已删除:`, id);
        return json(res, { success: true });
      }

      // ---- 设置 ----
      if (path === '/api/admin/settings' && method === 'GET') {
        const settingsKV = getKV('SETTINGS');
        const generalRaw = settingsKV.get('general');
        const doubaoRaw = settingsKV.get('doubao');
        const general = generalRaw ? JSON.parse(generalRaw) : { generateInterval: 10, weatherCity: '北京', maxHistoryCache: 50, maxLogCount: 100, promptWrapper: '', defaultTaskPrompt: '' };
        const doubao = doubaoRaw ? JSON.parse(doubaoRaw) : { model: 'doubao-seed-2-0-lite-260215', maxOutputTokens: 256, apiKey: '', disableThinking: true };
        // 脱敏
        if (doubao.apiKey) {
          doubao.apiKey = '********' + doubao.apiKey.slice(-4);
        }
        return json(res, { general, doubao });
      }

      if (path === '/api/admin/settings' && method === 'PUT') {
        const body = await readBody(req);
        const settingsKV = getKV('SETTINGS');
        if (body.general) {
          settingsKV.put('general', JSON.stringify(body.general));
        }
        if (body.doubao) {
          const existingRaw = settingsKV.get('doubao');
          const existing = existingRaw ? JSON.parse(existingRaw) : {};
          if (body.doubao.apiKey === '********') {
            body.doubao.apiKey = existing.apiKey || '';
          }
          settingsKV.put('doubao', JSON.stringify(body.doubao));
        }
        const updatedGeneral = settingsKV.get('general');
        const updatedDoubao = settingsKV.get('doubao');
        const general = updatedGeneral ? JSON.parse(updatedGeneral) : null;
        const doubao = updatedDoubao ? JSON.parse(updatedDoubao) : null;
        if (doubao?.apiKey) doubao.apiKey = '********' + doubao.apiKey.slice(-4);
        return json(res, { general, doubao });
      }

      // ---- 手动生成 ----
      if (path === '/api/admin/generate' && method === 'POST') {
        const body = await readBody(req);
        const userPrompt = body.prompt || '';

        // 读取设置（含天气城市）
        const settingsKV = getKV('SETTINGS');
        const generalRaw = settingsKV.get('general');
        const general = generalRaw ? JSON.parse(generalRaw) : {};
        const weatherCity = general.weatherCity || '北京';

        // 查找激活的提示词
        const promptsKV = getKV('PROMPTS');
        const promptList = promptsKV.list({ prefix: 'prompt_' });
        let activeSystemPrompt = '你是叫小斑的奶牛猫，住在主人电脑桌面上，性格慵懒傲娇又黏人。自称"本喵"，叫主人"两脚兽"或"铲屎的"。回复时带喵~、哼！、嗷！等猫语气词。';
        let activeUserTemplate = '';
        let activePromptName = '默认人设';
        for (const k of promptList.keys) {
          try {
            const p = JSON.parse(promptsKV.get(k.name));
            if (p && p.isActive) {
              activeSystemPrompt = p.systemPrompt || activeSystemPrompt;
              activeUserTemplate = p.userPromptTemplate || '';
              activePromptName = p.name || '未命名';
              break;
            }
          } catch {}
        }

        // 随机取语料库示例
        const corpusKV = getKV('CORPUS');
        const corpusList = corpusKV.list({ prefix: 'corpus_'});
        const allCorpus = corpusList.keys
          .map(k => { try { return JSON.parse(corpusKV.get(k.name)); } catch { return null; } })
          .filter(e => e && e.content)
          .sort(() => Math.random() - 0.5);
        const corpusExamples = allCorpus.slice(0, 5).map(e => e.content);

        // 变量插值（仅时间）
        const now = new Date();
        const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const weekday = weekdays[now.getDay()];
        const userPromptText = activeUserTemplate
          ? activeUserTemplate
              .replace(/\{\{time\}\}/g, timeStr)
              .replace(/\{\{context\}\}/g, `当前时间 ${timeStr}，${weekday}`)
          : (userPrompt || general.defaultTaskPrompt || '请根据当前时间，以奶牛猫的口吻说几句话。可以适当吐槽主人，表达当下的心情。');

        // 构建完整 prompt（使用自定义 wrapper 或默认模板）
        const corpusText = corpusExamples.length > 0
          ? corpusExamples.map((e, i) => `${i + 1}. "${e}"`).join('\n')
          : '';
        const timeLine = `现在是${timeStr}，${weekday}。`;

        const defaultWrapper = [
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

        const wrapper = general.promptWrapper || defaultWrapper;
        const fullPrompt = wrapper
          .replace(/\{\{TASK\}\}/g, userPromptText)
          .replace(/\{\{CHARACTER\}\}/g, activeSystemPrompt)
          .replace(/\{\{CORPUS\}\}/g, corpusText)
          .replace(/\{\{TIME\}\}/g, timeLine);

        const result = await mockCatGenerate(fullPrompt);

        const cacheEntry = {
          text: result.text, mood: result.mood,
          responseId: result.responseId, generatedAt: new Date().toISOString(),
          context: { prompt: userPrompt || '(默认)', promptName: activePromptName },
        };
        const cacheKV = getKV('CACHE');
        cacheKV.put('current', JSON.stringify(cacheEntry));

        const histRaw = cacheKV.get('history');
        const history = histRaw ? JSON.parse(histRaw) : [];
        history.unshift(cacheEntry);
        if (history.length > 50) history.length = 50;
        cacheKV.put('history', JSON.stringify(history));

        const logKV = getKV('LOGS');
        const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

        logKV.put('log_'+ new Date().toISOString().replace(/[-:T]/g,'').slice(0,15) + '_' + logId, JSON.stringify({
          id: logId, timestamp: new Date().toISOString(),
          input: { userPrompt: userPrompt || activeUserTemplate || '(默认)', systemPrompt: activeSystemPrompt, promptName: activePromptName, fullPrompt },
          output: {
            text: result.text, mood: result.mood, tokensUsed: result.tokensUsed, latencyMs: 50,
            searchesUsed: result.searchesUsed || 0, searchQueries: result.searchQueries || [], fullOutput: result._fullOutput || [],
          },
          rawExchange: {
            request: result._rawRequest || null,
            response: result._rawResponse || null,
          },
          trigger: 'manual',
        }));

        // 自动清理：仅保留最新 N 条日志（条数从设置读取）
        (() => {
          try {
            const maxCount = general.maxLogCount || general.logRetentionDays || 100;
            const allLogKeys = logKV.list({ prefix: 'log_' }).keys.map(k => k.name);
            if (allLogKeys.length > maxCount) {
              allLogKeys.sort(); // 字母序 = 时间序，升序 = 最旧在前
              const toDelete = allLogKeys.slice(0, allLogKeys.length - maxCount);
              toDelete.forEach(k => logKV.delete(k));
            }
          } catch {}
        })();

        return json(res, {
          success: true, text: result.text, mood: result.mood,
          tokensUsed: result.tokensUsed, latencyMs: 50, promptName: activePromptName,
        });
      }

      // ---- 日志 ----
      if (path === '/api/admin/logs' && method === 'GET') {
        const logKV = getKV('LOGS');
        const page = parseInt(url.searchParams.get('page') || '1');
        const pageSize = parseInt(url.searchParams.get('pageSize') || '20');

        // 列出所有 key，排序取最新，仅读取当前页条目
        const result = logKV.list({ prefix: 'log_' });
        const allKeys = result.keys.map(k => k.name).sort().reverse();
        const total = allKeys.length;
        const pageKeys = allKeys.slice((page - 1) * pageSize, page * pageSize);
        const items = pageKeys.map(k => {
          try { return JSON.parse(logKV.get(k)); } catch { return null; }
        }).filter(Boolean);

        return json(res, { items, total, page, pageSize });
      }

      if (path === '/api/admin/logs/export' && method === 'GET') {
        const logKV = getKV('LOGS');
        const result = logKV.list({ prefix: 'log_'});
        const logs = result.keys.map(k => {
          try { return JSON.parse(logKV.get(k.name)); } catch { return null; }
        }).filter(Boolean);
        logs.sort((a,b) => b.timestamp.localeCompare(a.timestamp));
        const format = url.searchParams.get('format') || 'json';
        if (format === 'csv') {
          const csv = '时间,触发方式,心情,说的话\n' + logs.map(l =>
            `"${l.timestamp}","${l.trigger}","${l.output?.mood||''}","${(l.output?.text||'').replace(/"/g,'""')}"`
          ).join('\n');
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          return res.end(csv);
        }
        return json(res, logs);
      }
    }

    // 404
    res.writeHead(404, corsHeaders());
    res.end(JSON.stringify({ error: 'Not found: ' + path }));
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ${method} ${path} — Error:`, err.message || err);
    if (err.stack) console.error(err.stack.split('\n').slice(0, 3).join('\n'));
    res.writeHead(500, corsHeaders());
    res.end(JSON.stringify({ error: err.message || '服务器内部错误', detail: err.stack?.split('\n')[0] }));
  }
}

const server = http.createServer(handleRequest);
server.listen(8788, () => {
  console.log('🐱 奶牛猫本地 API 服务器已启动: http://localhost:8788');
  console.log('   默认密码: admin123');
  console.log('   API 端点: /api/speak (公开), /api/ping, /api/debug');
  console.log('   管理后台: http://localhost:3000/admin');
  console.log('   豆包 API: 本地 mock 模式（随机返回猫咪语录）');
});
