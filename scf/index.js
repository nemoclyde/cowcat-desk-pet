/**
 * SCF 定时触发器 — 极简版
 * 仅负责定时向 EdgeOne Function 发 HTTP 请求
 *
 * 部署方式：
 * 1. 腾讯云 SCF 控制台创建云函数
 * 2. 配置 Timer Trigger（如每10分钟触发一次）
 * 3. 设置环境变量 EDGEONE_URL
 *
 * 无任何业务逻辑，不依赖任何 SDK
 */

const EDGEONE_URL = process.env.EDGEONE_URL || 'https://your-project.edgeone.app';

exports.main_handler = async (event, context) => {
  try {
    const url = `${EDGEONE_URL}/api/internal/generate`;
    console.log(`[CowCat SCF] Triggering generate: ${url}`);

    const response = await fetch(url, { method: 'POST' });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[CowCat SCF] Generate failed (${response.status}): ${body}`);
      return { success: false, status: response.status, body };
    }

    const result = await response.json();
    console.log(`[CowCat SCF] Generate success: "${result.text?.slice(0, 50)}..." | mood: ${result.mood} | tools: ${result.toolsUsed?.join(',')}`);

    return { success: true, text: result.text?.slice(0, 100) };
  } catch (err) {
    console.error(`[CowCat SCF] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
};
