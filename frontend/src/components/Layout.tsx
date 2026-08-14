import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, Scissors, Menu, X, Sun, Moon, Languages, ChevronDown } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { api } from '../api';
import SessionPanel from './SessionPanel';
import { useI18n, LANGS, type Lang } from '../i18n';

export default function Layout({ children }: { children: React.ReactNode }) {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langMenuPos, setLangMenuPos] = useState({ top: 0, right: 0 });
  const langBtnRef = useRef<HTMLButtonElement>(null);
  const isChat = location.pathname === '/';
  const isCalculator = location.pathname === '/calculator';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const toggleLangPicker = () => {
    if (!showLangPicker && langBtnRef.current) {
      const rect = langBtnRef.current.getBoundingClientRect();
      setLangMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setShowLangPicker(!showLangPicker);
  };

  /* replay view-enter animation on route change without remounting */
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.classList.remove('animate-view-enter');
    void el.offsetWidth; // force reflow
    el.classList.add('animate-view-enter');
  }, [location.pathname]);

  // 预加载板材数据，避免切换到切割页时出现"加载中…"
  useEffect(() => { api.preloadBoardMaterials(); }, []);

  if (!user) return null;

  const header = (
    <header className="h-12 flex items-center justify-between px-3 md:px-5 border-b border-[var(--border-primary)] bg-[var(--bg-card)] backdrop-blur-2xl shrink-0 relative">
      {/* Multi-layer AI ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/8 via-purple-500/5 to-cyan-500/6" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
        <div className="absolute -top-20 left-1/4 w-48 h-32 bg-blue-500/8 rounded-full blur-3xl" />
        <div className="absolute -top-16 right-1/4 w-40 h-28 bg-purple-500/6 rounded-full blur-3xl" />
      </div>
      <div className="flex items-center gap-2 md:gap-5 relative z-10">
        {/* Mobile hamburger */}
        {isChat && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-1.5 -ml-1 text-apple-text-secondary hover:text-apple-text transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-apple-blue to-purple-500 flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-apple-blue/25 ai-glow">AI</div>
          <h1 className="text-sm font-semibold text-apple-text tracking-wide hidden sm:block">{t('app.name')}</h1>
          <span className={`text-[10px] md:text-[11px] px-1.5 md:px-2 py-0.5 rounded-full ${
            user.role === 'super_admin' ? 'bg-purple-500/20 text-purple-400' :
            user.role === 'admin' ? 'bg-blue-500/20 text-blue-400' :
            'bg-apple-secondary text-apple-text-secondary'
          }`}>
            {user.role === 'super_admin' ? t('role.super_admin') : user.role === 'admin' ? t('role.admin') : t('role.user')}
          </span>
        </div>
        {/* Navigation tabs inside header */}
        <div className="flex items-center gap-0.5 md:gap-1 ml-0 md:ml-2">
          <button
            onClick={() => navigate('/')}
            className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-200 ${
              isChat ? 'bg-apple-blue/15 text-apple-blue shadow-sm shadow-apple-blue/10' : 'text-apple-text-secondary hover:text-apple-text hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('nav.chat')}</span>
          </button>
          <button
            onClick={() => navigate('/calculator')}
            className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-200 ${
              isCalculator ? 'bg-apple-blue/15 text-apple-blue shadow-sm shadow-apple-blue/10' : 'text-apple-text-secondary hover:text-apple-text hover:bg-white/5'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('nav.cut')}</span>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-3 relative z-10">
        {/* Language Picker */}
        <div>
          <button
            ref={langBtnRef}
            onClick={toggleLangPicker}
            className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] text-apple-text-secondary hover:text-apple-text hover:bg-white/5 transition-colors"
            title={t('label.language')}
          >
            <Languages className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{LANGS.find((l) => l.code === lang)?.native ?? lang}</span>
            <ChevronDown className="w-3 h-3 opacity-60 hidden sm:block" />
          </button>
          {showLangPicker && createPortal(
            <>
              <div className="fixed inset-0 z-[90]" onClick={() => setShowLangPicker(false)} />
              <div
                className="fixed z-[100] w-36 py-1 bg-apple-card border border-apple-border rounded-apple shadow-xl"
                style={{ top: langMenuPos.top, right: langMenuPos.right }}
              >
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { setLang(l.code); setShowLangPicker(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-apple-secondary transition-colors ${
                      l.code === lang ? 'text-apple-blue font-medium' : 'text-apple-text'
                    }`}
                  >
                    {l.native}
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}
        </div>

        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-apple-text-secondary hover:text-apple-text hover:bg-white/5 transition-colors"
          title={theme === 'dark' ? t('hint.switch_light') : t('hint.switch_dark')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {(user.role === 'admin' || user.role === 'super_admin') && (
          <button
            onClick={() => navigate('/admin')}
            className="text-[11px] md:text-xs text-apple-blue hover:opacity-80 transition-opacity"
          >
            {t('btn.admin')}
          </button>
        )}
        <span className="text-[11px] md:text-xs text-apple-text-secondary hidden xs:block">{user.username}</span>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="text-[11px] md:text-xs text-apple-text-secondary hover:text-apple-text transition-colors"
        >
          {t('btn.logout')}
        </button>
      </div>
    </header>
  );

  return (
    <div className="flex h-screen bg-apple-bg flex-col">
      {header}
      <div className="flex-1 flex min-h-0 relative">
        {/* Desktop sidebar */}
        {isChat && <div className="hidden md:block shrink-0"><SessionPanel /></div>}
        {/* Mobile sidebar overlay */}
        {isChat && sidebarOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
            <div className="fixed left-0 top-12 bottom-0 z-50 w-72 md:hidden animate-slide-in">
              <SessionPanel />
            </div>
          </>
        )}
        <main ref={mainRef} className="flex-1 overflow-hidden min-w-0">{children}</main>
      </div>
    </div>
  );
}
