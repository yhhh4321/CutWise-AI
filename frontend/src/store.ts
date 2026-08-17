import { create } from 'zustand';
import { api, streamChat } from './api';

interface User {
  id: number;
  username: string;
  email: string | null;
  role: string;
  is_active: boolean;
}

interface Session {
  id: number;
  title: string;
  model_name: string | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: number;
  session_id: number;
  role: string;
  content: string;
  model_name: string | null;
  tokens: number;
  created_at: string;
}

interface Template {
  id: number;
  name: string;
  model_name: string;
  system_prompt: string;
  provider_id: number;
  created_at: string;
}

interface AppState {
  user: User | null;
  sessions: Session[];
  templates: Template[];
  currentSessionId: number | null;
  messages: Message[];
  streaming: boolean;
  model: string;
  availableModels: string[];
  sessionKey: number;
  quota: { dailyMessagesUsed: number; dailyMessagesLimit: number; dailyTokensUsed: number; dailyTokensLimit: number } | null;
  abortController: AbortController | null;

  // Auth
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;

  // Sessions
  loadSessions: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  loadProviders: () => Promise<void>;
  selectSession: (id: number) => Promise<void>;
  newSession: () => Promise<void>;
  newSessionFromTemplate: (templateId: number) => Promise<void>;
  deleteSession: (id: number) => Promise<void>;
  renameSession: (id: number, title: string) => Promise<void>;

  // Chat
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (messageId: number) => Promise<void>;
  editAndResend: (messageId: number, newContent: string) => Promise<void>;
  loadQuota: () => Promise<void>;
  setModel: (model: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  sessions: [],
  templates: [],
  currentSessionId: null,
  messages: [],
  streaming: false,
  model: 'Qwen/Qwen2.5-7B-Instruct',
  availableModels: [],
  sessionKey: 0,
  quota: null,
  abortController: null,

  async login(username, password, remember) {
    const res = await api.login(username, password, remember);
    localStorage.setItem('token', res.access_token);
    set({ user: res.user });
    await get().loadSessions();
  },

  async register(username, password, email?) {
    const res = await api.register(username, password, email);
    localStorage.setItem('token', res.access_token);
    set({ user: res.user });
  },

  logout() {
    localStorage.removeItem('token');
    set({ user: null, sessions: [], currentSessionId: null, messages: [] });
  },

  async loadUser() {
    try {
      const user = await api.getMe();
      set({ user });
      await get().loadSessions();
    } catch {
      localStorage.removeItem('token');
    }
  },

  async loadSessions() {
    const sessions = await api.getSessions();
    const templates = await api.getTemplates().catch(() => [] as Template[]);
    set({ sessions, templates });
    // 同步加载模型库，填充 availableModels
    get().loadProviders();
  },

  async loadTemplates() {
    const templates = await api.getTemplates().catch(() => [] as Template[]);
    set({ templates });
  },

  async loadProviders() {
    const providers = await api.getProviders().catch(() => [] as any[]);
    const models = new Set<string>();
    for (const p of providers) {
      if (p.is_active !== false) {
        for (const m of (p.models || [])) {
          models.add(m);
        }
      }
    }
    const availableModels = Array.from(models);
    // 如果当前 model 不在可用列表中，自动切到第一个
    const { model } = get();
    if (availableModels.length > 0 && !availableModels.includes(model)) {
      set({ availableModels, model: availableModels[0] });
    } else {
      set({ availableModels });
    }
  },

  async selectSession(id) {
    const data = await api.getSession(id);
    set({ currentSessionId: id, messages: data.messages || [] });
  },

  async newSession() {
    set({ currentSessionId: null, messages: [], sessionKey: get().sessionKey + 1 });
  },

  async newSessionFromTemplate(templateId) {
    const session = await api.createSession(undefined, templateId);
    set((s) => ({ sessions: [session, ...s.sessions], sessionKey: s.sessionKey + 1 }));
    const data = await api.getSession(session.id);
    set({ currentSessionId: session.id, messages: data.messages || [] });
  },

  async deleteSession(id) {
    await api.deleteSession(id);
    const { currentSessionId } = get();
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
    if (currentSessionId === id) {
      set({ currentSessionId: null, messages: [] });
    }
  },

  async renameSession(id, title) {
    await api.renameSession(id, title);
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
    }));
  },

  async sendMessage(content) {
    const { currentSessionId, model, streaming } = get();
    if (streaming) return;

    const tempUserMsg: Message = {
      id: Date.now(),
      session_id: currentSessionId || 0,
      role: 'user',
      content,
      model_name: model,
      tokens: 0,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, tempUserMsg], streaming: true }));

    let assistantContent = '';
    const tempAiMsg: Message = {
      id: Date.now() + 1,
      session_id: currentSessionId || 0,
      role: 'assistant',
      content: '',
      model_name: model,
      tokens: 0,
      created_at: new Date().toISOString(),
    };

    set((s) => ({ messages: [...s.messages, tempAiMsg] }));

    const controller = streamChat(
      currentSessionId,
      content,
      model,
      localStorage.getItem('lang') || 'zh',
      (token) => {
        assistantContent += token;
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === tempAiMsg.id ? { ...m, content: assistantContent } : m
          ),
        }));
      },
      async () => {
        set({ streaming: false, abortController: null });
        await get().loadSessions();
        const state = get();
        let sessionId = state.currentSessionId;
        if (!sessionId && state.sessions.length > 0) {
          sessionId = state.sessions[0].id;
          set({ currentSessionId: sessionId });
        }
        if (sessionId) {
          try {
            const data = await api.getSession(sessionId);
            set({ messages: data.messages || [] });
          } catch {
            // 刷新失败时保留当前消息，避免清空用户可见内容
          }
        }
        get().loadQuota();
      },
      (err) => {
        if (err.name === 'AbortError') {
          set({ streaming: false, abortController: null });
          return;
        }
        set({ streaming: false, abortController: null });
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === tempAiMsg.id ? { ...m, content: `错误: ${err.message}` } : m
          ),
        }));
      },
    );
    set({ abortController: controller });
  },

  stopGeneration() {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
  },

  async regenerateMessage(messageId: number) {
    if (get().streaming) return;
    const { currentSessionId, messages } = get();
    if (!currentSessionId) return;

    // Find the user message just before this AI message
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx <= 0) return;
    const prevMsg = messages[idx - 1];
    if (prevMsg.role !== 'user') return;

    // Trim from this message onward
    await api.trimMessages(currentSessionId, messageId);
    // Reload and resend
    const data = await api.getSession(currentSessionId);
    set({ messages: data.messages || [] });
    await get().sendMessage(prevMsg.content);
  },

  async editAndResend(messageId: number, newContent: string) {
    if (get().streaming) return;
    const { currentSessionId } = get();
    if (!currentSessionId) return;

    // Trim from this message onward
    await api.trimMessages(currentSessionId, messageId);
    // Reload messages
    const data = await api.getSession(currentSessionId);
    set({ messages: data.messages || [] });
    // Send the edited content
    await get().sendMessage(newContent);
  },

  async loadQuota() {
    try {
      const quota = await api.getQuota();
      set({ quota });
    } catch {
      // quota not critical, silent fail
    }
  },

  setModel(model) {
    set({ model });
  },
}));
