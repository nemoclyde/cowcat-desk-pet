import { useState, useEffect } from 'react';
import {
  Card, Button, Table, Modal, Form, Input, InputNumber, Select,
  Space, Typography, message, Popconfirm, Tag, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { getCorpus, createCorpus, updateCorpus, batchImportCorpus, deleteCorpus } from '../services/api';

const { TextArea } = Input;
const { Text } = Typography;

const CATEGORIES = ['日常', '撒娇', '吐槽', '节日', '天气', '深夜', '饭点', '玩耍'];
const CATEGORY_COLORS: Record<string, string> = {
  '日常': 'default', '撒娇': 'pink', '吐槽': 'orange', '节日': 'gold',
  '天气': 'cyan', '深夜': 'purple', '饭点': 'green', '玩耍': 'blue',
};
// Pre-computed to avoid re-creating array in render path
const CATEGORY_OPTIONS = CATEGORIES.map(c => ({ label: c, value: c }));

export default function CorpusManager() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchCategory, setBatchCategory] = useState('日常');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const result = await getCorpus({
        page, pageSize: 50,
        category: categoryFilter || undefined,
        keyword: keyword || undefined,
      });
      setData(result.items || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || '加载语料库失败';
      setError(msg);
    }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchData(); }, [page, categoryFilter]);

  function handleSearch() { setPage(1); fetchData(); }

  function openCreate() {
    setEditingEntry(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(record: any) {
    setEditingEntry(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  }

  async function handleSave() {
    setActionError(null);
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (editingEntry) {
        await updateCorpus(editingEntry.id, values);
        message.success('语料已更新');
      } else {
        await createCorpus(values);
        message.success('已添加');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingEntry(null);
      fetchData();
    } catch (err: any) {
      // 表单校验失败由 Form 组件自己展示，不需要 toast
      if (!err.errorFields) {
        const detail = err.response?.data?.error || err.response?.data?.detail || err.message || '未知错误';
        console.error('[CorpusManager] 保存失败:', err.response?.status, detail, err);
        const errorMsg = `保存失败 (${err.response?.status || '网络错误'}): ${detail}`;
        setActionError(errorMsg);
        message.error(errorMsg, 5);
      }
      throw err; // 让 Modal 保持打开（校验失败或 API 失败时）
    } finally {
      setSaving(false);
    }
  }

  async function handleBatchImport() {
    if (!batchText.trim()) {
      message.warning('请粘贴语料内容');
      return;
    }
    // 按行拆分
    const lines = batchText.split('\n').filter(l => l.trim());
    const items = lines.map(line => ({
      content: line.trim(),
      category: batchCategory,
      keywords: [],
      weight: 1,
    }));

    try {
      const result = await batchImportCorpus(items);
      message.success(`成功导入 ${result.count} 条语料`);
      setBatchModalOpen(false);
      setBatchText('');
      fetchData();
    } catch (err: any) {
      const detail = err.response?.data?.error || err.message;
      message.error('导入失败: ' + detail);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCorpus(id);
      message.success('已删除');
      fetchData();
    } catch (err: any) {
      const detail = err.response?.data?.error || err.message || '未知错误';
      console.error('[CorpusManager] 删除失败:', err.response?.status, detail, err);
      message.error('删除失败 (' + (err.response?.status || '网络错误') + '): ' + detail, 5);
    }
  }

  const columns = [
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (cat: string) => <Tag color={CATEGORY_COLORS[cat] || 'default'}>{cat}</Tag>,
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
    },
    {
      title: '关键词',
      dataIndex: 'keywords',
      key: 'keywords',
      width: 200,
      render: (kws: string[]) => kws?.map((kw: string) => <Tag key={kw}>{kw}</Tag>),
    },
    {
      title: '权重',
      dataIndex: 'weight',
      key: 'weight',
      width: 60,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="📚 语料库管理"
        extra={
          <Space>
            <Button icon={<UploadOutlined />} onClick={() => setBatchModalOpen(true)}>批量导入</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              添加语料
            </Button>
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
          <Select
            allowClear
            placeholder="全部分类"
            style={{ width: 120 }}
            value={categoryFilter || undefined}
            onChange={(v) => { setCategoryFilter(v || ''); setPage(1); }}
            options={CATEGORY_OPTIONS}
          />
          <Input.Search
            placeholder="搜索关键词..."
            style={{ width: 250 }}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onSearch={handleSearch}
            allowClear
          />
          <Text type="secondary">共 {total} 条语料</Text>
        </Space>

        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 50,
            onChange: setPage,
            showTotal: (t) => `共 ${t} 条`,
          }}
          size="small"
        />
      </Card>

      {/* 单条添加/编辑弹窗 */}
      <Modal
        title={editingEntry ? '编辑语料' : '添加语料'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditingEntry(null); setActionError(null); }}
        okText={editingEntry ? '保存' : '添加'}
        cancelText="取消"
        confirmLoading={saving}
        destroyOnClose
      >
        {actionError && (
          <Alert
            type="error"
            message="操作失败"
            description={actionError}
            showIcon
            closable
            onClose={() => setActionError(null)}
            style={{ marginBottom: 12 }}
          />
        )}
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="奶牛猫的语料内容..." />
          </Form.Item>
          <Form.Item name="keywords" label="关键词">
            <Select mode="tags" placeholder="输入后回车添加" />
          </Form.Item>
          <Form.Item name="weight" label="权重 (1-10)">
            <InputNumber min={1} max={10} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入弹窗 */}
      <Modal
        title="批量导入语料"
        open={batchModalOpen}
        onOk={handleBatchImport}
        onCancel={() => { setBatchModalOpen(false); setBatchText(''); }}
        width={600}
        okText="导入"
        cancelText="取消"
      >
        <div style={{ marginTop: 16 }}>
          <Form.Item label="分类">
            <Select
              value={batchCategory}
              onChange={setBatchCategory}
              options={CATEGORY_OPTIONS}
              style={{ width: 150 }}
            />
          </Form.Item>
          <TextArea
            rows={10}
            placeholder="每行一条语料，粘贴后自动拆分&#10;例如：&#10;喵~今天天气真好，两脚兽快带本喵出去玩！&#10;哼！都几点了还不给本喵开罐头！&#10;呼噜呼噜...本喵困了，别吵..."
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
          />
          <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
            当前共 {batchText.split('\n').filter(l => l.trim()).length} 行待导入
          </Text>
        </div>
      </Modal>
    </div>
  );
}
