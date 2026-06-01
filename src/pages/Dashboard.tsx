import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Typography, Tag, Space, Row, Col, Statistic, message, Spin, Alert, Input } from 'antd';
import { ReloadOutlined, ThunderboltOutlined, ClockCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { getSpeak, triggerGenerate, getLogs, getSettings, updateSettings } from '../services/api';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const DEFAULT_TASK = '请根据当前时间，以奶牛猫的口吻说几句话。可以适当吐槽主人，表达当下的心情。';

// Module-level constant to avoid re-creation on every render
const MOOD_COLORS: Record<string, string> = {
  '开心': 'orange', '傲娇': 'purple', '慵懒': 'blue', '撒娇': 'pink',
  '疯癫': 'red', '关心': 'green', '日常': 'default',
};

export default function Dashboard() {
  const [cacheData, setCacheData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [taskPrompt, setTaskPrompt] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        getSpeak(),
        getLogs({ pageSize: 5 }),
        getSettings(),
      ]);
      const [speakResult, logsResult, settingsResult] = results;

      if (speakResult.status === 'fulfilled') {
        setCacheData(speakResult.value);
      } else {
        setError((prev) => prev || '加载猫咪回复失败');
      }
      if (logsResult.status === 'fulfilled') {
        setRecentLogs(logsResult.value?.items || []);
      } else {
        setError((prev) => prev || '加载日志失败');
      }
      if (settingsResult.status === 'fulfilled') {
        const saved = settingsResult.value?.general?.defaultTaskPrompt;
        if (saved) setTaskPrompt(saved);
      } else {
        setError((prev) => prev || '加载设置失败');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await triggerGenerate();
      if (result.success) {
        message.success(`生成成功！心情：${result.mood} | 提示词：${result.promptName || '默认'} | 用时：${result.latencyMs}ms`);
        await fetchData();
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      const detail = err.response?.data?.error || err.response?.data?.detail || err.message;
      message.error('生成失败: ' + detail);
    } finally {
      setGenerating(false);
    }
  }

  async function saveTaskPrompt() {
    setSavingTask(true);
    try {
      // 先获取当前所有设置，然后合并 defaultTaskPrompt（避免覆盖其他字段）
      const current = await getSettings();
      const existingGeneral = current?.general || {};
      await updateSettings({
        general: { ...existingGeneral, defaultTaskPrompt: taskPrompt },
      });
      message.success('任务指令已保存');
    } catch (err: any) {
      message.error('保存失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingTask(false);
    }
  }

  if (loading) return <Spin tip="加载中..." style={{ display: 'block', marginTop: 100 }} />;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          {/* 任务指令编辑 */}
          <Card
            title="📝 任务指令（{{TASK}}）"
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={generating}
                  onClick={handleGenerate}
                >
                  立刻生成
                </Button>
                <Button
                  icon={<SaveOutlined />}
                  loading={savingTask}
                  onClick={saveTaskPrompt}
                >
                  保存指令
                </Button>
              </Space>
            }
          >
            <TextArea
              value={taskPrompt}
              onChange={e => setTaskPrompt(e.target.value)}
              placeholder={DEFAULT_TASK}
              autoSize={{ minRows: 2, maxRows: 4 }}
              style={{ fontSize: 14 }}
            />
            <div style={{ marginTop: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                留空则使用默认："{DEFAULT_TASK}"。支持 {'{{time}}'}、{'{{context}}'} 变量。
              </Text>
            </div>
          </Card>

          {/* 猫咪回复 */}
          <Card
            title="🐱 奶牛猫正在说..."
            extra={
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchData}
              >
                刷新
              </Button>
            }
          >
            {error && (
              <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />
            )}

            {cacheData ? (
              <div style={{ background: '#fafafa', borderRadius: 8, padding: 24, minHeight: 80 }}>
                <Paragraph style={{ fontSize: 18, lineHeight: 1.8, marginBottom: 16 }}>
                  {cacheData.text}
                </Paragraph>
                <Space wrap>
                  <Tag color={MOOD_COLORS[cacheData.mood] || 'default'}>{cacheData.mood}</Tag>
                  {cacheData.context && cacheData.context.time && (
                    <Tag icon={<ClockCircleOutlined />} color="blue">{cacheData.context.time}</Tag>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    生成于 {cacheData.generatedAt ? new Date(cacheData.generatedAt).toLocaleString('zh-CN') : '未知'}
                  </Text>
                </Space>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>😴</div>
                <Text type="secondary">缓存为空，点击「立刻生成」让奶牛猫说吧~</Text>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="📊 状态概览">
            <Statistic
              title="缓存状态"
              value={cacheData ? '有缓存' : '无缓存'}
              valueStyle={{ color: cacheData ? '#52c41a' : '#faad14' }}
              prefix={cacheData ? '✅' : '⚠️'}
            />
            <Statistic
              title="最近心情"
              value={cacheData?.mood || '-'}
              style={{ marginTop: 16 }}
            />
            <Statistic
              title="当前心情"
              value={cacheData?.mood ?? '-'}
              style={{ marginTop: 16 }}
            />
          </Card>

          <Card title="📜 最近日志" style={{ marginTop: 16 }}>
            {recentLogs.length === 0 ? (
              <Text type="secondary">暂无日志</Text>
            ) : (
              recentLogs.map((log: any) => (
                <div key={log.id || log.timestamp} style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}>
                  <Space size={4}>
                    <Tag>{log.trigger === 'manual' ? '🖐 手动' : '⏰ 定时'}</Tag>
                    <Tag color={MOOD_COLORS[log.output?.mood]}>{log.output?.mood}</Tag>
                  </Space>
                  <Paragraph
                    ellipsis={{ rows: 1 }}
                    style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}
                  >
                    {log.output?.text}
                  </Paragraph>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
