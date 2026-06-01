import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, Modal, Input, message, Typography } from 'antd';
import {
  DashboardOutlined,
  EditOutlined,
  BookOutlined,
  FileTextOutlined,
  SettingOutlined,
  FileAddOutlined,
  LogoutOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import { changePassword } from '../services/api';

const { Sider, Content, Header } = AntLayout;
const { Text } = Typography;

// Module-level constants to avoid re-creation on every render
const MENU_ITEMS = [
  { key: '/admin', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/admin/prompts', icon: <EditOutlined />, label: '提示词' },
  { key: '/admin/corpus', icon: <BookOutlined />, label: '语料库' },
  { key: '/admin/logs', icon: <FileTextOutlined />, label: '日志' },
  { key: '/admin/settings', icon: <SettingOutlined />, label: '设置' },
  { key: '/admin/content', icon: <FileAddOutlined />, label: '内容管理' },
];

const SIDER_HEADER_STYLE: React.CSSProperties = {
  textAlign: 'center', color: '#fff', fontWeight: 600,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [changing, setChanging] = useState(false);

  const selectedKey = useMemo(() => {
    const path = location.pathname;
    if (path === '/admin') return '/admin';
    for (const item of MENU_ITEMS) {
      if (path.startsWith(item.key) && item.key !== '/admin') return item.key;
    }
    return '/admin';
  }, [location.pathname]);

  async function handleChangePassword() {
    if (!oldPwd || !newPwd) {
      message.warning('请填写旧密码和新密码');
      return;
    }
    if (newPwd.length < 4) {
      message.warning('新密码至少4位');
      return;
    }
    setChanging(true);
    try {
      await changePassword(oldPwd, newPwd);
      message.success('密码修改成功');
      setPwdModalOpen(false);
      setOldPwd('');
      setNewPwd('');
    } catch (err: any) {
      message.error(err.response?.data?.error || '修改失败');
    } finally {
      setChanging(false);
    }
  }

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ background: '#1a1a2e' }}
        theme="dark"
      >
        <div style={{
          ...SIDER_HEADER_STYLE,
          padding: collapsed ? '16px 8px' : '16px',
          fontSize: collapsed ? 16 : 20,
        }}>
          {collapsed ? '🐱' : '🐱 奶牛猫后台'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderRight: 0, marginTop: 8 }}
        />
      </Sider>
      <AntLayout>
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Button
            type="text"
            icon={<KeyOutlined />}
            onClick={() => setPwdModalOpen(true)}
          >
            修改密码
          </Button>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={logout}
            danger
          >
            退出
          </Button>
        </Header>
        <Content style={{ padding: 24, background: '#f5f5f5' }}>
          {children}
        </Content>
      </AntLayout>

      <Modal
        title="修改登录密码"
        open={pwdModalOpen}
        onOk={handleChangePassword}
        onCancel={() => { setPwdModalOpen(false); setOldPwd(''); setNewPwd(''); }}
        confirmLoading={changing}
        okText="确认修改"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
          <Input.Password
            placeholder="旧密码"
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
          />
          <Input.Password
            placeholder="新密码"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
          />
          <Text type="secondary">密码经过加密存储，不会以明文保存</Text>
        </div>
      </Modal>
    </AntLayout>
  );
}
