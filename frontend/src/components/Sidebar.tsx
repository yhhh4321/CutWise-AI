import { useState, useRef } from 'react';
import { useStore } from '../store';
import { MessageSquare, Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import { useI18n } from '../i18n';

export default function Sidebar() {
  const { t } = useI18n();
  const { sessions, currentSessionId, selectSession, newSession, deleteSession, renameSession } = useStore();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
    <aside className="w-64 shrink-0 bg-apple-card border-r border-apple-border flex flex-col">
      <div className="p-4">
        <div className="flex items-center gap-2.5 mb-3 px-1">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-apple-blue to-purple-500 flex items-center justify-center text-[8px] font-bold text-white">AI</div>
          <span className="text-xs font-semibold text-white">{t('app.name')}</span>
        </div>
        <button
          onClick={newSession}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-apple-blue to-purple-500 hover:opacity-90 text-white text-sm font-medium py-2.5 rounded-apple transition-all shadow-md shadow-apple-blue/20"
        >
          <Plus className="w-4 h-4" /> {t('title.new_chat')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
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
                  className="flex-1 bg-apple-tertiary text-white text-xs px-2 py-1 rounded outline-none min-w-0"
                  onClick={(e) => e.stopPropagation()}
                />
                <button onClick={(e) => { e.stopPropagation(); confirmEdit(s.id); }} className="text-apple-blue p-0.5"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-apple-text-secondary p-0.5"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-xs text-white truncate">{s.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(s.id, s.title); }}
                  className="opacity-0 group-hover:opacity-100 text-apple-text-secondary hover:text-white p-0.5 transition-all"
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
          <p className="text-xs text-apple-text-secondary text-center mt-8">{t('label.no_sessions_detail')}</p>
        )}
      </div>
    </aside>
  );
}
