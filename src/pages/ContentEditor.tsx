import { useState, useEffect } from 'react';
import { Card, Tabs, Form, Input, Button, message, Spin, Alert, Typography, Space } from 'antd';
import { SaveOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { getContent, updateContent } from '../services/api';

const { TextArea } = Input;
const { Text, Title } = Typography;

interface ContentData {
  content: Record<string, any>;
  defaults: Record<string, any>;
}

// Tab 分类定义
const TABS = [
  {
    key: 'toolDesc',
    label: '工具描述',
    fields: [
      { key: 'toolDesc_time', label: '时间工具描述', rows: 2 },
      { key: 'toolDesc_weather', label: '天气工具描述', rows: 2 },
      { key: 'toolDesc_weather_param', label: '天气工具-参数描述', rows: 1 },
      { key: 'toolDesc_holiday', label: '节日工具描述', rows: 2 },
      { key: 'toolDesc_corpusSearch', label: '语料库搜索工具描述', rows: 2 },
      { key: 'toolDesc_corpusSearch_param', label: '语料库搜索-参数描述', rows: 1 },
    ],
  },
  {
    key: 'timeTexts',
    label: '时间文案',
    fields: [
      { key: 'weekdays', label: '星期名称 (JSON 数组)', rows: 1 },
      { key: 'periods', label: '时段名称 (JSON 数组)', rows: 1 },
      { key: 'time_isWeekend', label: '周末提示', rows: 1 },
      { key: 'time_isWeekday', label: '工作日提示', rows: 1 },
    ],
  },
  {
    key: 'weatherTexts',
    label: '天气文案',
    fields: [
      { key: 'weather_conditions', label: '天气代码→中文 (JSON)', rows: 3 },
      { key: 'weather_catNotes', label: '温度体感猫语 (JSON)', rows: 3 },
      { key: 'weather_rainWarning', label: '下雨提醒', rows: 1 },
      { key: 'weather_fallback', label: '天气回退值', rows: 1 },
      { key: 'weather_serviceDown', label: '天气服务不可用', rows: 1 },
    ],
  },
  {
    key: 'holidayTexts',
    label: '节日文案',
    fields: [
      { key: 'holiday_names', label: '节日名称映射 (JSON)', rows: 3 },
      { key: 'holiday_catMessages', label: '节日猫语 (JSON)', rows: 3 },
      { key: 'holiday_noHoliday', label: '无节日回退', rows: 1 },
      { key: 'holiday_weekend', label: '周末提示', rows: 1 },
    ],
  },
  {
    key: 'fallbacks',
    label: '兜底文案',
    fields: [
      { key: 'fallback_emptyResponse', label: 'AI 返回空文本', rows: 1 },
      { key: 'fallback_noSpeakCache', label: 'speak 接口无缓存', rows: 2 },
      { key: 'fallback_speakError', label: 'speak 接口出错', rows: 2 },
      { key: 'fallback_defaultSystemPrompt', label: '默认系统提示词', rows: 6 },
      { key: 'fallback_defaultUserPrompt', label: '默认任务指令', rows: 3 },
    ],
  },
  {
    key: 'searchRules',
    label: '搜索规则',
    fields: [
      { key: 'searchRules', label: '联网搜索规则', rows: 6 },
    ],
  },
];

function formatValue(v: any): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v) || (typeof v === 'object' && !Array.isArray(v))) {
    return JSON.stringify(v, null, 2);
  }
  return String(v);
}

function parseValue(raw: string, _default: any): any {
  if (raw.trim() === '') return _default;
  if (Array.isArray(_default) || (typeof _default === 'object' && _default !== null && !Array.isArray(_default))) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

export default function ContentEditor() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ContentData | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('toolDesc');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getContent();
      setData(result);
      const vals: Record<string, string> = {};
      const content = result.content || {};
      const defaults = result.defaults || {};
      for (const tab of TABS) {
        for (const field of tab.fields) {
          vals[field.key] = formatValue(content[field.key] ?? defaults[field.key]);
        }
      }
      setFormValues(vals);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const defaults = data?.defaults || {};
      const bundle: Record<string, any> = {};
      for (const tab of TABS) {
        for (const field of tab.fields) {
          bundle[field.key] = parseValue(formValues[field.key] || '', defaults[field.key]);
        }
      }
      await updateContent(bundle);
      message.success('内容已保存，下次生成生效');
      setData(prev => prev ? { ...prev, content: bundle } : prev);
    } catch (err: any) {
      message.error('保存失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  }

  function handleReset(fieldKey: string) {
    const defVal = data?.defaults?.[fieldKey];
    setFormValues(prev => ({ ...prev, [fieldKey]: formatValue(defVal) }));
  }

  function updateField(key: string, value: string) {
    setFormValues(prev => ({ ...prev, [key]: value }));
  }

  if (loading) return <Spin tip="加载中..." style={{ display: 'block', marginTop: 100 }} />;

  return (
    <div>
      {error && (
        <Alert type="error" message="加载失败" description={error} showIcon closable onClose={() => setError(null)}
          action={<Button size="small" onClick={load}>重试</Button>} style={{ marginBottom: 16 }} />
      )}
      <Card
        title="📝 内容管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存全部</Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          管理所有发送给 AI 的中文文案。修改后即时生效（下次生成使用新内容）。JSON 类型字段请保持合法 JSON 格式。
        </Text>
        <Tabs activeKey={activeTab} onChange={setActiveTab} tabPosition="left" style={{ minHeight: 500 }}>
          {TABS.map(tab => (
            <Tabs.TabPane tab={tab.label} key={tab.key}>
              <div style={{ maxWidth: 800 }}>
                {tab.fields.map(field => (
                  <div key={field.key} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text strong>{field.label}</Text>
                      <Button size="small" icon={<UndoOutlined />} onClick={() => handleReset(field.key)}>
                        恢复默认
                      </Button>
                    </div>
                    <TextArea
                      value={formValues[field.key] || ''}
                      onChange={e => updateField(field.key, e.target.value)}
                      rows={field.rows}
                      style={{ fontFamily: 'monospace', fontSize: 13 }}
                    />
                    {data?.defaults?.[field.key] !== undefined && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        默认: {formatValue(data.defaults[field.key]).slice(0, 100)}
                        {formatValue(data.defaults[field.key]).length > 100 ? '...' : ''}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            </Tabs.TabPane>
          ))}
        </Tabs>
      </Card>
    </div>
  );
}
