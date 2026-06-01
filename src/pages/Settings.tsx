import { useState, useEffect } from 'react';
import {
  Card, Form, Input, InputNumber, Button, Switch, Divider,
  Typography, message, Spin, Space, Alert, Tag,
} from 'antd';
import { SaveOutlined, KeyOutlined } from '@ant-design/icons';
import { getSettings, updateSettings } from '../services/api';

const { Text } = Typography;

export default function Settings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getSettings();
        const general = data.general || {};
        const doubao = data.doubao || {};

        form.setFieldsValue({
          generateInterval: general.generateInterval ?? 10,
          weatherCity: general.weatherCity || '北京',
          maxHistoryCache: general.maxHistoryCache ?? 50,
          maxLogCount: general.maxLogCount || general.logRetentionDays || 100,
          promptWrapper: general.promptWrapper || '',
          defaultTaskPrompt: general.defaultTaskPrompt || '',
          model: doubao.model || 'doubao-seed-2-0-lite-260215',
          maxOutputTokens: doubao.maxOutputTokens ?? 256,
          disableThinking: doubao.disableThinking ?? true,
          apiKey: doubao.apiKey ? '********' + doubao.apiKey.slice(-4) : '',
        });

        setHasApiKey(!!doubao.apiKey);
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || '加载设置失败';
        setError(msg);
      }
      finally { setLoading(false); }
    }
    load();
  }, [form]);

  async function handleSave() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const general = {
        generateInterval: values.generateInterval,
        weatherCity: values.weatherCity,
        maxHistoryCache: values.maxHistoryCache,
        maxLogCount: values.maxLogCount ?? 100,
        promptWrapper: values.promptWrapper || '',
        defaultTaskPrompt: values.defaultTaskPrompt || '',
      };

      const doubao: any = {
        model: values.model,
        maxOutputTokens: values.maxOutputTokens ?? 256,
        disableThinking: values.disableThinking ?? true,
      };

      // 只有当用户输入了新 API Key 时才更新
      if (values.apiKey && !values.apiKey.startsWith('********')) {
        doubao.apiKey = values.apiKey;
      } else if (!values.apiKey) {
        doubao.apiKey = '';
      } else {
        doubao.apiKey = '********'; // 保持旧的
      }

      await updateSettings({ general, doubao });
      message.success('设置已保存');

      // 更新显示
      if (doubao.apiKey && doubao.apiKey !== '********') {
        form.setFieldsValue({ apiKey: '********' + doubao.apiKey.slice(-4) });
        setHasApiKey(true);
      } else if (doubao.apiKey === '********') {
        // 保持旧 key 不变
        setHasApiKey(true);
      } else {
        // apiKey 为空字符串 → 未设置
        setHasApiKey(false);
      }
    } catch (err: any) {
      const detail = err.response?.data?.error || err.message;
      message.error('保存失败: ' + detail);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spin tip="加载中..." style={{ display: 'block', marginTop: 100 }} />;

  return (
    <div>
      {error && (
        <Alert
          type="error"
          message="加载设置失败"
          description={error}
          showIcon
          closable
          onClose={() => setError(null)}
          action={<Button size="small" onClick={() => window.location.reload()}>重试</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card
        title="⚙️ 全局设置"
        extra={
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            保存设置
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          {/* 豆包 API 设置 */}
          <Text strong style={{ fontSize: 16 }}><KeyOutlined /> 豆包 API 配置</Text>
          <Alert
            type="info"
            message="豆包 API Key 从火山引擎方舟控制台获取 → https://console.volcengine.com/ark"
            style={{ margin: '12px 0' }}
            showIcon
          />

          <Form.Item name="apiKey" label="API Key" htmlFor="settings-apikey">
            <Input.Password
              id="settings-apikey"
              placeholder="输入豆包 API Key"
              addonAfter={hasApiKey ? <Tag color="green">已设置</Tag> : <Tag color="red">未设置</Tag>}
            />
          </Form.Item>

          <Form.Item name="model" label="模型" extra="输入豆包 Responses API 支持的模型名称，如 doubao-seed-2-0-lite-260215" htmlFor="settings-model">
            <Input id="settings-model" placeholder="doubao-seed-2-0-lite-260215" />
          </Form.Item>

          <Space size="large">
            <Form.Item name="maxOutputTokens" label="输出 Token 上限" extra="奶牛猫只说1-3句，256足够；设大值浪费钱" htmlFor="settings-maxout">
              <InputNumber id="settings-maxout" min={64} max={4096} step={64} />
            </Form.Item>
            <Form.Item name="disableThinking" label="关闭深度思考" valuePropName="checked" extra="桌宠无需深度推理，关闭可节省大量 Token 成本">
              <Switch id="settings-nothink" />
            </Form.Item>
          </Space>
          <Divider />

          {/* 通用设置 */}
          <Text strong style={{ fontSize: 16 }}>📋 通用设置</Text>

          <Space size="large" style={{ marginTop: 16 }} wrap>
            <Form.Item name="generateInterval" label="AI 生成间隔（分钟）" htmlFor="settings-interval">
              <InputNumber id="settings-interval" min={1} max={1440} addonAfter="分钟" />
            </Form.Item>
            <Form.Item name="weatherCity" label="天气默认城市" htmlFor="settings-city">
              <Input id="settings-city" style={{ width: 150 }} placeholder="北京" />
            </Form.Item>
            <Form.Item name="maxHistoryCache" label="历史缓存条数" htmlFor="settings-history">
              <InputNumber id="settings-history" min={10} max={500} />
            </Form.Item>
            <Form.Item name="maxLogCount" label="日志最大条数" htmlFor="settings-logret">
              <InputNumber id="settings-logret" min={10} max={1000} addonAfter="条" />
            </Form.Item>
          </Space>

          <Form.Item
            name="promptWrapper"
            label="Prompt 外包装模板"
            extra={
              '自定义发送给 AI 的 prompt 结构。支持占位符：{{TASK}}（任务指令）、{{CHARACTER}}（角色设定）、{{CORPUS}}（语料库示例）、{{TIME}}（当前时间）。留空则使用默认模板。'
            }
            style={{ marginTop: 16 }}
          >
            <Input.TextArea
              id="settings-wrapper"
              rows={12}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
              placeholder={
                '【你的任务 — 请严格遵循以下指令，这是你最优先要做的事】\n{{TASK}}\n{{CORPUS}}\n【角色设定 — 这是你说话的身份和风格，用于塑造你的语气，但不要让它覆盖上面的任务指令】\n{{CHARACTER}}\n\n{{TIME}}\n\n【联网搜索规则】\n- 如果回复涉及实时信息...请使用 web_search 搜索\n- 如果是日常闲聊...不要搜索\n- 上下文中已提供了时间等基础信息，无需为此搜索'
              }
            />
          </Form.Item>

          <Form.Item
            name="defaultTaskPrompt"
            label="默认任务指令（{{TASK}}）"
            extra="当没有激活的提示词模板时，使用此文本作为 {{TASK}} 占位符的内容。留空则使用系统默认。支持 {{time}}、{{context}} 变量。"
            style={{ marginTop: 16 }}
          >
            <Input.TextArea
              id="settings-task"
              rows={3}
              style={{ fontSize: 13 }}
              placeholder="请根据当前时间，以奶牛猫的口吻说几句话。可以适当吐槽主人，表达当下的心情。"
            />
          </Form.Item>

          <Divider />

          {/* 修改密码 */}
          <Text strong style={{ fontSize: 16 }}>🔐 修改密码</Text>
          <div style={{ marginTop: 12 }}>
            <Text type="secondary">请在顶部导航栏点击「修改密码」按钮操作</Text>
          </div>
        </Form>
      </Card>
    </div>
  );
}
