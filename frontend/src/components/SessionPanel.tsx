import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { useI18n } from '../i18n';
import { MessageSquare, Plus, Trash2, Edit3, Check, X, Bot } from 'lucide-react';

export default function SessionPanel() {
  const { sessions, templates, currentSessionId, loadTemplates, selectSession, newSession, newSessionFromTemplate, deleteSession, renameSession } = useStore();
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadTemplates(); }, []);

  const startEdit = (id: number, title: string) => {
    setEditingId(id);
    setEditTitle(title);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const confirmEdit = (id: number) => {
    if (editTitle.trim()) renameSession(id, editTitle.trim());
    setEditingId(null);
  };

  return (
    <aside className="w-60 shrink-0 bg-apple-card border-r border-apple-border flex flex-col">
      <div className="p-3">
        <button
          onClick={newSession}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-apple-blue to-purple-500 hover:opacity-90 text-white text-sm font-medium py-2.5 rounded-apple transition-all shadow-md shadow-apple-blue/20"
        >
          <Plus className="w-4 h-4" /> {t('title.new_chat')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* Templates Section */}
        {templates.length > 0 && (
          <>
            <div className="text-[10px] text-apple-text-secondary uppercase tracking-wider px-1 py-2 font-semibold">
              {t('section.templates')}
            </div>
            {templates.map((t) => (
              <div
                key={t.id}
                onClick={() => newSessionFromTemplate(t.id)}
                className="group flex items-center gap-2 px-3 py-2 rounded-apple cursor-pointer transition-colors mb-0.5 hover:bg-apple-blue/10 border border-apple-blue/10"
              >
                <Bot className="w-4 h-4 shrink-0 text-apple-blue" />
                <span className="flex-1 text-xs text-apple-blue truncate">{t.name}</span>
              </div>
            ))}
            <div className="text-[10px] text-apple-text-secondary uppercase tracking-wider px-1 py-2 font-semibold mt-1">
              {t('section.sessions')}
            </div>
          </>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => !editingId && selectSession(s.id)}
            className={`group flex items-center gap-2 px-3 py-2.5 rounded-apple cursor-pointer transition-colors mb-0.5 ${
              s.id === currentSessionId ? 'bg-apple-secondary' : 'hover:bg-apple-secondary/60'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0 text-apple-text-secondary" />
            {editingId === s.id ? (
              <div className="flex-1 flex items-center gap-1 min-w-0">
                <input
                  ref={inputRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmEdit(s.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 bg-apple-tertiary text-apple-text text-xs px-2 py-1 rounded outline-none min-w-0"
                  onClick={(e) => e.stopPropagation()}
                />
                <button onClick={(e) => { e.stopPropagation(); confirmEdit(s.id); }} className="text-apple-blue p-0.5"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-apple-text-secondary p-0.5"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-xs text-apple-text truncate">{s.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(s.id, s.title); }}
                  className="opacity-0 group-hover:opacity-100 text-apple-text-secondary hover:text-apple-text p-0.5 transition-all"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-0.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="text-xs text-apple-text-secondary text-center mt-8">{t('label.no_sessions')}</p>
        )}
      </div>
    </aside>
  );
}
