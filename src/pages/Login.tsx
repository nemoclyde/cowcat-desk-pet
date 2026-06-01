import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Input, Button, Typography, Space, message, Alert } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';

const { Title, Text } = Typography;

export default function Login() {
  const { login, loading, error } = useAuth();
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  async function handleLogin() {
    if (!password) {
      message.warning('请输入密码');
      return;
    }
    const ok = await login(password);
    if (ok) {
      navigate('/admin');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    }}>
      <Card
        style={{ width: 400, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
        styles={{ body: { padding: 40 } }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 64 }}>🐱</div>
          <Title level={3} style={{ margin: 0 }}>奶牛猫桌宠管理后台</Title>
          <Text type="secondary">请输入密码以继续</Text>

          {error && <Alert type="error" message={error} showIcon closable />}

          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="管理员密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onPressEnter={handleLogin}
            disabled={loading}
          />
          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            onClick={handleLogin}
          >
            登录
          </Button>
        </Space>
      </Card>
    </div>
  );
}
