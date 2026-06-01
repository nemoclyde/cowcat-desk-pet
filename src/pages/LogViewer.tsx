import { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Tag, Typography, DatePicker, Select, message,
  Modal, Descriptions, Tooltip, Alert,
} from 'antd';
import { DownloadOutlined, EyeOutlined, FilterOutlined } from '@ant-design/icons';
import { getLogs, exportLogs } from '../services/api';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// Module-level constant to avoid re-creation on every render
const MOOD_COLORS: Record<string, string> = {
  '开心': 'orange', '傲娇': 'purple', '慵懒': 'blue', '撒娇': 'pink',
  '疯癫': 'red', '关心': 'green', '日常': 'default',
};

export default function LogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [triggerFilter, setTriggerFilter] = useState<string>('');
  const [moodFilter, setMoodFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [detailModal, setDetailModal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page, pageSize: 20 };
      if (triggerFilter) params.trigger = triggerFilter;
      if (moodFilter) params.mood = moodFilter;
      if (dateRange) {
        params.dateFrom = dateRange[0];
        params.dateTo = dateRange[1];
      }
      const result = await getLogs(params);
      setLogs(result.items || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || '加载日志失败';
      setError(msg);
    }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchData(); }, [page, triggerFilter, moodFilter, dateRange]);

  async function handleExport(format: 'csv' | 'json') {
    try {
      const params: any = { format };
      if (triggerFilter) params.trigger = triggerFilter;
      if (moodFilter) params.mood = moodFilter;
      if (dateRange) {
        params.dateFrom = dateRange[0];
        params.dateTo = dateRange[1];
      }
      const blob = await exportLogs(params);
      // 触发浏览器下载
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cowcat-logs-${dayjs().format('YYYY-MM-DD')}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  }

  const columns = [
    {
      title: '时间', dataIndex: 'timestamp', key: 'timestamp', width: 160,
      render: (ts: string) => dayjs(ts).format('MM-DD HH:mm:ss'),
    },
    {
      title: '触发', dataIndex: 'trigger', key: 'trigger', width: 80,
      render: (t: string) => t === 'manual'
        ? <Tag color="blue">🖐 手动</Tag>
        : <Tag color="default">⏰ 定时</Tag>,
    },
    {
      title: '心情', dataIndex: ['output', 'mood'], key: 'mood', width: 80,
      render: (m: string) => <Tag color={MOOD_COLORS[m] || 'default'}>{m || '-'}</Tag>,
    },
    {
      title: '说的话', dataIndex: ['output', 'text'], key: 'text',
      ellipsis: true,
      render: (t: string) => (
        <Tooltip title={t}>
          <span>{t}</span>
        </Tooltip>
      ),
    },
    {
      title: '延迟', dataIndex: ['output', 'latencyMs'], key: 'latency', width: 80,
      render: (ms: number) => `${ms}ms`,
    },
    {
      title: '搜索', dataIndex: ['output', 'searchesUsed'], key: 'searches', width: 60,
      render: (n: number) => n > 0 ? <Tag color="orange">{n}次</Tag> : <Tag>-</Tag>,
    },
    {
      title: 'Token', dataIndex: ['output', 'tokensUsed'], key: 'tokens', width: 70,
    },
    {
      title: '操作', key: 'actions', width: 60,
      render: (_: any, record: any) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(record)} />
      ),
    },
  ];

  return (
    <div>
      <Card
        title="📋 调用日志"
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('csv')}>导出 CSV</Button>
            <Button icon={<DownloadOutlined />} onClick={() => handleExport('json')}>导出 JSON</Button>
          </Space>
        }
      >
        {error && (
          <Alert
            type="error"
            message="加载失败"
            description={error}
            showIcon
            closable
            onClose={() => setError(null)}
            action={<Button size="small" onClick={fetchData}>重试</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        <Space style={{ marginBottom: 16 }} wrap>
          <FilterOutlined />
          <Select
            allowClear
            placeholder="触发方式"
            style={{ width: 120 }}
            value={triggerFilter || undefined}
            onChange={(v) => { setTriggerFilter(v || ''); setPage(1); }}
            options={[
              { label: '定时', value: 'scheduled' },
              { label: '手动', value: 'manual' },
            ]}
          />
          <Select
            allowClear
            placeholder="心情"
            style={{ width: 120 }}
            value={moodFilter || undefined}
            onChange={(v) => { setMoodFilter(v || ''); setPage(1); }}
            options={[
              { label: '开心', value: '开心' }, { label: '傲娇', value: '傲娇' },
              { label: '慵懒', value: '慵懒' }, { label: '撒娇', value: '撒娇' },
              { label: '疯癫', value: '疯癫' }, { label: '关心', value: '关心' },
            ]}
          />
          <RangePicker
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
              } else {
                setDateRange(null);
              }
              setPage(1);
            }}
          />
          <Text type="secondary">共 {total} 条记录</Text>
        </Space>

        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: setPage,
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </Card>

      {/* 日志详情弹窗 */}
      <Modal
        title="日志详情"
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={700}
      >
        {detailModal && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="时间">{dayjs(detailModal.timestamp).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            <Descriptions.Item label="触发方式">
              <Tag color={detailModal.trigger === 'manual' ? 'blue' : 'default'}>
                {detailModal.trigger === 'manual' ? '手动' : '定时'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="使用的提示词">{detailModal.input?.promptName || '-'}</Descriptions.Item>
            <Descriptions.Item label="完整请求 Prompt">
              <div style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12 }}>
                {detailModal.input?.fullPrompt || detailModal.input?.userPrompt || '-'}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="模型回复">
              <div style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12 }}>
                {detailModal.output?.text || '-'}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="心情">
              <Tag color={MOOD_COLORS[detailModal.output?.mood]}>{detailModal.output?.mood}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Token 用量">{detailModal.output?.tokensUsed || '-'}</Descriptions.Item>
            <Descriptions.Item label="延迟">{detailModal.output?.latencyMs}ms</Descriptions.Item>
            <Descriptions.Item label="搜索次数">
              {detailModal.output?.searchesUsed > 0
                ? <Tag color="orange">{detailModal.output.searchesUsed} 次</Tag>
                : <Tag>未搜索</Tag>
              }
            </Descriptions.Item>
            {detailModal.output?.searchQueries?.length > 0 && (
              <Descriptions.Item label="搜索关键词">
                {detailModal.output.searchQueries.map((q: string, i: number) => (
                  <Tag key={i} color="blue" style={{ marginBottom: 4 }}>{q}</Tag>
                ))}
              </Descriptions.Item>
            )}
            {detailModal.rawExchange?.request && (
              <Descriptions.Item label="📤 发送给豆包的原始请求">
                <div style={{ maxHeight: 250, overflow: 'auto', background: '#1a1a2e', color: '#ffcc80', padding: 12, borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {JSON.stringify(detailModal.rawExchange.request, null, 2)}
                </div>
              </Descriptions.Item>
            )}
            {detailModal.rawExchange?.response && (
              <Descriptions.Item label="📥 豆包返回的原始响应">
                <div style={{ maxHeight: 250, overflow: 'auto', background: '#1a1a2e', color: '#a0ffa0', padding: 12, borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {JSON.stringify(detailModal.rawExchange.response, null, 2)}
                </div>
              </Descriptions.Item>
            )}
            {detailModal.output?.fullOutput?.length > 0 && (
              <Descriptions.Item label="API 完整交互（已处理）">
                <div style={{ maxHeight: 300, overflow: 'auto', background: '#1a1a2e', color: '#81d4fa', padding: 12, borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {JSON.stringify(detailModal.output.fullOutput, null, 2)}
                </div>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
