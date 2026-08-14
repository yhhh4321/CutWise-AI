import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import MessageBubble from '../components/MessageBubble';
import { Send, ChevronDown, Square, AlertTriangle } from 'lucide-react';
import { useI18n } from '../i18n';

export default function Chat() {
  const {
    messages, streaming, model, availableModels, quota, currentSessionId,
    sendMessage, stopGeneration, regenerateMessage, editAndResend,
    setModel, loadQuota,
  } = useStore();
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showQuotaWarning, setShowQuotaWarning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const msgAreaRef = useRef<HTMLDivElement>(null);

  /* replay animation on session switch without remounting */
  useEffect(() => {
    const el = msgAreaRef.current;
    if (!el) return;
    el.classList.remove('animate-view-enter');
    void el.offsetWidth;
    el.classList.add('animate-view-enter');
  }, [currentSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming, currentSessionId]);

  useEffect(() => {
    loadQuota();
  }, [currentSessionId, messages.length]);

  useEffect(() => {
    if (quota) {
      const pct = quota.dailyMessagesLimit > 0
        ? quota.dailyMessagesUsed / quota.dailyMessagesLimit
        : 0;
      setShowQuotaWarning(pct >= 0.8 && quota.dailyMessagesLimit > 0);
    }
  }, [quota]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    sendMessage(trimmed);
    setInput('');
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleEdit = (messageId: number, currentContent: string) => {
    setInput(currentContent);
    setEditingId(messageId);
    inputRef.current?.focus();
  };

  const handleEditSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !editingId || streaming) return;
    editAndResend(editingId, trimmed);
    setInput('');
    setEditingId(null);
  };

  const handleRegenerate = (messageId: number) => {
    if (streaming) return;
    regenerateMessage(messageId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 md:px-5 py-2 md:py-2.5 border-b border-apple-border bg-apple-bg/80 backdrop-blur-apple shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-1 md:gap-1.5 text-[11px] md:text-xs text-apple-text-secondary hover:text-apple-text bg-apple-secondary px-2 md:px-3 py-1 md:py-1.5 rounded-apple transition-colors max-w-[160px] md:max-w-none truncate"
            >
              <span className="truncate">{model}</span> <ChevronDown className="w-3 h-3 shrink-0" />
            </button>
            {showModelPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowModelPicker(false)} />
                <div className="absolute top-full left-0 mt-1 bg-apple-card border border-apple-border rounded-apple shadow-xl z-20 w-48 py-1">
                  {availableModels.length > 0 ? availableModels.map((m) => (
                    <button
                      key={m}
                      onClick={() => { setModel(m); setShowModelPicker(false); }}
                      className={`w-full text-left px-4 py-2 text-xs hover:bg-apple-secondary transition-colors ${
                        m === model ? 'text-apple-blue' : 'text-apple-text'
                      }`}
                    >
                      {m}
                    </button>
                  )) : (
                    <p className="px-4 py-3 text-xs text-apple-text-secondary">{t('label.model_tip')}</p>
                  )}
                </div>
              </>
            )}
          </div>
          {quota && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-apple-text-secondary whitespace-nowrap">
                今日 {quota.dailyMessagesUsed}{quota.dailyMessagesLimit > 0 ? `/${quota.dailyMessagesLimit}` : ''} 条 · {quota.dailyTokensUsed} tokens
              </span>
              {quota.dailyMessagesLimit > 0 && (
                <div className="hidden md:flex items-center gap-1">
                  <div className="w-12 h-1 rounded-full bg-apple-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${quota.dailyMessagesUsed / quota.dailyMessagesLimit >= 0.8 ? 'bg-yellow-400' : 'bg-apple-blue'}`}
                      style={{ width: `${Math.min(100, (quota.dailyMessagesUsed / quota.dailyMessagesLimit) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-apple-text-secondary">
                    {Math.round((quota.dailyMessagesUsed / quota.dailyMessagesLimit) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {showQuotaWarning && (
            <span className="text-[11px] text-yellow-400 flex items-center gap-1" title="用量已超过 80%">
              <AlertTriangle className="w-3 h-3" />
              <span className="hidden md:inline">用量告警</span>
            </span>
          )}
          {streaming ? (
            <button
              onClick={stopGeneration}
              className="flex items-center gap-1 md:gap-1.5 text-[11px] md:text-xs text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 px-2 md:px-3 py-1 md:py-1.5 rounded-apple transition-colors"
            >
              <Square className="w-3 h-3" /> <span className="hidden md:inline">停止</span>
            </button>
          ) : (
            <span className="text-[11px] text-apple-text-secondary">就绪</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={msgAreaRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full h-full">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-apple-blue/30 to-purple-500/30 blur-xl ai-throb" />
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-apple-blue to-purple-500 flex items-center justify-center ai-glow">
                  <span className="text-white text-2xl font-bold">AI</span>
                </div>
              </div>
              <p className="text-apple-text text-base font-medium mb-1">{t('title.new_chat')}</p>
              <p className="text-apple-text-secondary text-xs">我能帮你写作、分析、编程、解答问题</p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={msg.id} className="msg-enter">
              <MessageBubble
                msg={msg}
                onCopy={handleCopy}
                onEdit={handleEdit}
                onRegenerate={handleRegenerate}
                isLastAssistant={
                  msg.role === 'assistant' &&
                  idx === messages.length - 1
                }
                streaming={streaming}
              />
            </div>
          ))
        )}
        {streaming && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
          <div className="flex gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-apple-blue to-purple-500 flex items-center justify-center shrink-0 text-xs font-bold text-white">AI</div>
            <div className="flex gap-1 items-center py-1">
              <span className="w-2 h-2 rounded-full bg-apple-text-secondary dot-pulse" />
              <span className="w-2 h-2 rounded-full bg-apple-text-secondary dot-pulse" />
              <span className="w-2 h-2 rounded-full bg-apple-text-secondary dot-pulse" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-3 md:p-4 border-t border-apple-border bg-apple-bg/80 backdrop-blur-apple">
        <div className="max-w-4xl mx-auto w-full">
        {editingId && (
          <div className="text-[11px] text-apple-text-secondary mb-2 flex items-center gap-2">
            <span className="text-apple-blue">编辑模式</span>
            <button onClick={() => { setEditingId(null); setInput(''); }} className="hover:text-apple-text transition-colors">取消</button>
          </div>
        )}
        <div className="flex items-end gap-2 md:gap-3 bg-apple-card border border-apple-border rounded-2xl px-3 md:px-4 py-2.5 md:py-3 focus-within:border-apple-blue/60 focus-within:shadow-lg focus-within:shadow-apple-blue/10 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholder.input')}
            rows={1}
            className="flex-1 bg-transparent text-apple-text text-sm resize-none outline-none placeholder:text-apple-text-secondary max-h-32"
            disabled={streaming}
          />
          <button
            onClick={editingId ? handleEditSend : handleSend}
            disabled={!input.trim() || streaming}
            className="shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-br from-apple-blue to-purple-500 hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-md shadow-apple-blue/20"
          >
            <Send className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
