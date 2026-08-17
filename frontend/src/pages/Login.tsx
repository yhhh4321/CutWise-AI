import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useI18n } from '../i18n';

export default function Login() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(username, password, email || undefined);
      } else {
        await login(username, password, remember);
      }
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-apple-bg relative overflow-hidden">
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-apple-blue/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

      <div className="w-full max-w-sm mx-4 relative z-10">
        <div className="bg-apple-card/80 backdrop-blur-apple rounded-2xl p-8 shadow-2xl border border-apple-border">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-apple-blue to-purple-500 flex items-center justify-center text-base font-bold text-white shadow-lg shadow-apple-blue/30 ai-glow">AI</div>
          </div>
          <h1 className="text-xl font-bold text-white text-center mb-1">{t('hint.login_title')}</h1>
          <p className="text-apple-text-secondary text-sm text-center mb-8">{t('hint.login_subtitle')}</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-2.5 rounded-apple mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-apple-text-secondary mb-1.5">{t('label.username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-apple-secondary border border-apple-border rounded-apple px-4 py-2.5 text-white text-sm placeholder:text-apple-text-secondary focus:outline-none focus:border-apple-blue transition-colors"
                placeholder={t('placeholder.username')}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-apple-text-secondary mb-1.5">{t('label.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-apple-secondary border border-apple-border rounded-apple px-4 py-2.5 text-white text-sm placeholder:text-apple-text-secondary focus:outline-none focus:border-apple-blue transition-colors"
                placeholder={t('placeholder.password')}
                required
              />
            </div>
            {isRegister && (
              <div>
                <label className="block text-xs text-apple-text-secondary mb-1.5">{t('label.email_optional')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-apple-secondary border border-apple-border rounded-apple px-4 py-2.5 text-white text-sm placeholder:text-apple-text-secondary focus:outline-none focus:border-apple-blue transition-colors"
                  placeholder="example@company.com"
                />
              </div>
            )}
            {!isRegister && (
              <label className="flex items-center gap-2 text-xs text-apple-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-apple-blue"
                />
                <span>{t('label.remember_detail')}</span>
              </label>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-apple-blue to-purple-500 hover:opacity-90 disabled:opacity-50 text-white font-medium py-2.5 rounded-apple transition-all text-sm shadow-lg shadow-apple-blue/20"
            >
              {loading ? t('hint.processing') : isRegister ? t('btn.register') : t('btn.login')}
            </button>
          </form>

          <p className="text-center mt-5 text-xs text-apple-text-secondary">
            {isRegister ? t('hint.has_account') : t('hint.no_account')}
            <button
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-apple-blue ml-1 hover:underline"
            >
              {isRegister ? t('hint.go_login') : t('hint.go_register')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
