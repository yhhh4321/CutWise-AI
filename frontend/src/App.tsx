import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useStore } from './store';
import { ThemeProvider } from './ThemeContext';
import { I18nProvider } from './i18n';
import Login from './pages/Login';
import Chat from './pages/Chat';
import Admin from './pages/Admin';
import BoardCalculator from './pages/BoardCalculator';
import Layout from './components/Layout';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const user = useStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !['admin', 'super_admin'].includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ChatWithKey() {
  const sessionKey = useStore((s) => s.sessionKey);
  return <Chat key={sessionKey} />;
}

export default function App() {
  const loadUser = useStore((s) => s.loadUser);
  const user = useStore((s) => s.user);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      loadUser().finally(() => setInitialized(true));
    } else {
      setInitialized(true);
    }
  }, []);

  if (!initialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-apple-bg">
        <div className="text-apple-text-secondary text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <ThemeProvider>
    <I18nProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<ProtectedRoute><Layout><ChatWithKey /></Layout></ProtectedRoute>} />
        <Route path="/calculator" element={<ProtectedRoute><Layout><BoardCalculator /></Layout></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Layout><Admin /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </I18nProvider>
    </ThemeProvider>
  );
}
