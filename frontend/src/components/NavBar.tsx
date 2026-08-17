import { MessageSquare, Scissors } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';

export default function NavBar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const isCalculator = location.pathname === '/calculator';

  return (
    <nav className="w-14 shrink-0 bg-apple-card border-r border-apple-border flex flex-col items-center py-4 gap-2">
      <div
        onClick={() => navigate('/')}
        className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-apple cursor-pointer transition ${
          !isCalculator ? 'bg-apple-blue text-white' : 'text-apple-text-secondary hover:text-white'
        }`}
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-none">{t('nav.chat')}</span>
      </div>
      <div
        onClick={() => navigate('/calculator')}
        className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-apple cursor-pointer transition ${
          isCalculator ? 'bg-apple-blue text-white' : 'text-apple-text-secondary hover:text-white'
        }`}
      >
        <Scissors className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-none">{t('nav.cut')}</span>
      </div>
    </nav>
  );
}
