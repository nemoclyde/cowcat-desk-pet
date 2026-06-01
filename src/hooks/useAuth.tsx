import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { login as apiLogin } from '../services/api';

interface AuthState {
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** 客户端解码 JWT exp 字段，判断 token 是否过期（避免无效请求 + 401 重定向延迟） */
function isTokenValid(): boolean {
  try {
    const token = localStorage.getItem('cowcat_token');
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    // 客户端校验 token 过期时间，避免已过期 token 引发 3 个 API 请求全部 401
    isLoggedIn: isTokenValid(),
    loading: false,
    error: null,
  });

  const login = useCallback(async (password: string): Promise<boolean> => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const result = await apiLogin(password);
      localStorage.setItem('cowcat_token', result.token);
      localStorage.setItem('cowcat_refresh', result.refreshToken);
      setState({ isLoggedIn: true, loading: false, error: null });
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || '登录失败';
      setState(s => ({ ...s, loading: false, error: msg }));
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('cowcat_token');
    localStorage.removeItem('cowcat_refresh');
    setState({ isLoggedIn: false, loading: false, error: null });
  }, []);

  const { Provider } = AuthContext;
  const contextValue = useMemo<AuthContextType>(
    () => ({ ...state, login, logout }),
    [state, login, logout]
  );
  return (
    <Provider value={contextValue}>
      {children}
    </Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
