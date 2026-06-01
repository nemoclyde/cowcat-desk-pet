import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';

// Route-level code splitting: each page loads on demand
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PromptEditor = lazy(() => import('./pages/PromptEditor'));
const CorpusManager = lazy(() => import('./pages/CorpusManager'));
const LogViewer = lazy(() => import('./pages/LogViewer'));
const Settings = lazy(() => import('./pages/Settings'));
const ContentEditor = lazy(() => import('./pages/ContentEditor'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300, color: '#999' }}>
    Loading...
  </div>
);

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  // 监听 auth:expired 事件（由 api.ts 401 拦截器触发），用 navigate 而非整页刷新
  useEffect(() => {
    const handler = () => {
      logout();
      navigate('/admin/login', { replace: true });
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, [logout, navigate]);

  return (
    <Routes>
      <Route path="/admin/login" element={
        isLoggedIn ? <Navigate to="/admin" replace /> : (
          <Suspense fallback={<PageLoader />}>
            <Login />
          </Suspense>
        )
      } />
      <Route path="/admin/*" element={
        <PrivateRoute>
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/prompts" element={<PromptEditor />} />
                <Route path="/corpus" element={<CorpusManager />} />
                <Route path="/logs" element={<LogViewer />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/content" element={<ContentEditor />} />
              </Routes>
            </Suspense>
          </Layout>
        </PrivateRoute>
      } />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
