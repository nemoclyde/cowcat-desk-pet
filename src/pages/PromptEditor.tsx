import { useState, useEffect } from 'react';
import {
  Card, Button, Table, Modal, Form, Input, InputNumber, Slider, Switch,
  Space, Typography, message, Popconfirm, Tag, Select, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { getPrompts, createPrompt, updatePrompt, deletePrompt, triggerGenerate } from '../services/api';

const { TextArea } = Input;
const { Text, Title } = Typography;

export default function PromptEditor() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function fetchPrompts() {
    setLoading(true);
    setError(null);
    try {
      const data = await getPrompts();
      setPrompts(data);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || '加载提示词失败';
      setError(msg);
    }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchPrompts(); }, []);

  function openCreate() {
    setEditingPrompt(null);
    form.resetFields();
    form.setFieldsValue({ temperature: 0.9, maxTokens: 512, isActive: false });
    setModalOpen(true);
    setTestResult(null);
  }

  function openEdit(record: any) {
    setEditingPrompt(record);
    form.setFieldsValue(record);
    setModalOpen(true);
    setTestResult(null);
  }

  async function handleSave() {
    setActionError(null);
    setSaving(true);
    try {
      const values = await form.validateFields();
      if (editingPrompt) {
        await updatePrompt(editingPrompt.id, values);
        message.success('提示词已更新');
      } else {
        await createPrompt(values);
        message.success('提示词已创建');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingPrompt(null);
      fetchPrompts();
    } catch (err: any) {
      // 表单校验失败由 Form 组件自己展示，不需要 toast
      if (!err.errorFields) {
        const detail = err.response?.data?.error || err.response?.data?.detail || err.message || '未知错误';
        console.error('[PromptEditor] 保存失败:', err.response?.status, detail, err);
        const errorMsg = `保存失败 (${err.response?.status || '网络错误'}): ${detail}`;
        setActionError(errorMsg);
        message.error(errorMsg, 5);
      }
      throw err; // 让 Modal 保持打开（校验失败或 API 失败时）
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePrompt(id);
      message.success('已删除');
      fetchPrompts();
    } catch (err: any) {
      const detail = err.response?.data?.error || err.message || '未知错误';
      console.error('[PromptEditor] 删除失败:', err.response?.status, detail, err);
      message.error('删除失败 (' + (err.response?.status || '网络错误') + '): ' + detail, 5);
    }
  }

  async function handleTest() {
    const values = form.getFieldsValue();
    setTesting(true);
    setTestResult(null);
    try {
      // 临时保存为激活状态，然后手动生成
      if (editingPrompt) {
        await updatePrompt(editingPrompt.id, { ...editingPrompt, ...values, isActive: true });
      }
      const result = await triggerGenerate();
      if (result.success) {
        setTestResult(result.text);
      } else {
        setTestResult('(生成失败: ' + (result.error || '未知错误') + ')');
      }
      fetchPrompts();
    } catch (err: any) {
      setTestResult('(错误: ' + (err.message || '请求失败') + ')');
    } finally {
      setTesting(false);
    }
  }

  // 变量插入
  function insertVariable(variable: string) {
    const current = form.getFieldValue('userPromptTemplate') || '';
    form.setFieldsValue({ userPromptTemplate: current + variable });
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 150 },
    {
      title: '系统提示词',
      dataIndex: 'systemPrompt',
      key: 'systemPrompt',
      ellipsis: true,
      render: (text: string) => text?.slice(0, 80) + (text?.length > 80 ? '...' : ''),
    },
    { title: '温度', dataIndex: 'temperature', key: 'temperature', width: 80 },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (v: boolean) => v ? <Tag color="green">激活</Tag> : <Tag>停用</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
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
        title="📝 提示词编辑器"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建提示词</Button>}
      >
        {error && (
          <Alert
            type="error"
            message="加载失败"
            description={error}
            showIcon
            closable
            onClose={() => setError(null)}
            action={<Button size="small" onClick={fetchPrompts}>重试</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        <Table
          dataSource={prompts}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingPrompt ? '编辑提示词' : '新建提示词'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditingPrompt(null); setActionError(null); }}
        width={800}
        okText="保存"
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
            style={{ marginTop: 8 }}
          />
        )}
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：日常问候" />
          </Form.Item>

          <Form.Item name="systemPrompt" label="系统提示词（奶牛猫人设）" rules={[{ required: true }]}>
            <TextArea rows={8} placeholder="定义奶牛猫的性格、规则..." />
          </Form.Item>

          <Form.Item
            name="userPromptTemplate"
            label={
              <Space>
                用户提示词模板
                <Text type="secondary">点击插入变量：</Text>
                <Button size="small" onClick={() => insertVariable('{{time}}')}>时间</Button>
                <Button size="small" onClick={() => insertVariable('{{weather}}')}>天气</Button>
                <Button size="small" onClick={() => insertVariable('{{holiday}}')}>节日</Button>
                <Button size="small" onClick={() => insertVariable('{{context}}')}>完整上下文</Button>
              </Space>
            }
          >
            <TextArea rows={4} placeholder='如：{{context}}&#10;&#10;请根据以上信息，说1-3句话...' />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="temperature" label="温度" style={{ width: 300 }}>
              <Slider min={0} max={2} step={0.1} marks={{ 0: '0', 0.5: '0.5', 1: '1', 1.5: '1.5', 2: '2' }} />
            </Form.Item>
            <Form.Item name="maxTokens" label="最大 Token">
              <InputNumber min={64} max={4096} step={64} />
            </Form.Item>
            <Form.Item name="isActive" label="激活" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>

        {testResult && (
          <Alert
            type="info"
            message="测试结果"
            description={testResult}
            style={{ marginTop: 16 }}
          />
        )}

        <Button
          type="dashed"
          icon={<PlayCircleOutlined />}
          loading={testing}
          onClick={handleTest}
          block
          style={{ marginTop: 16 }}
        >
          测试生成（使用当前提示词生成一句话）
        </Button>
      </Modal>
    </div>
  );
}
