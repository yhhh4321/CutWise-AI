const BASE = '/api';

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  console.log('[api] request', path, 'status:', res.status);
  if (res.status === 401) {
    // 登录接口的 401 是"密码错误"，不应触发全局拦截
    const isAuthEndpoint = path === '/auth/login' || path === '/auth/register';
    if (!isAuthEndpoint) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('未登录');
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || '请求失败');
  }
  return res.json();
}

// 预加载缓存：Layout 挂载时触发，避免 BoardCalculator 首次渲染"加载中…"闪烁
let _boardMaterialsPromise: Promise<any[]> | null = null;

export const api = {
  // Auth
  login: (username: string, password: string, remember: boolean = false) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, remember }) }),
  register: (username: string, password: string, email?: string) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, email }) }),
  getMe: () => request('/auth/me'),

  // Chat
  getSessions: () => request('/chat/sessions'),
  getTemplates: () => request('/chat/templates'),
  createSession: (title?: string, templateId?: number) => {
    const params = new URLSearchParams();
    if (templateId) params.set('template_id', String(templateId));
    if (title) params.set('title', title);
    const qs = params.toString();
    return request(`/chat/sessions${qs ? `?${qs}` : ''}`, { method: 'POST' });
  },
  getSession: (id: number) => request(`/chat/sessions/${id}`),
  deleteSession: (id: number) => request(`/chat/sessions/${id}`, { method: 'DELETE' }),
  renameSession: (id: number, title: string) =>
    request(`/chat/sessions/${id}?title=${encodeURIComponent(title)}`, { method: 'PATCH' }),
  trimMessages: (sessionId: number, fromMessageId: number) =>
    request(`/chat/sessions/${sessionId}/messages/${fromMessageId}`, { method: 'DELETE' }),
  getQuota: () => request('/chat/quota'),

  // Admin
  getUsers: () => request('/admin/users'),
  createUser: (username: string, password: string, role?: string) =>
    request('/admin/users', { method: 'POST', body: JSON.stringify({ username, password, role: role || 'user' }) }),
  toggleUserActive: (userId: number) => request(`/admin/users/${userId}/toggle-active`, { method: 'PATCH' }),
  getAuditLogs: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/audit${qs ? `?${qs}` : ''}`);
  },
  getUserSessions: (userId: number) => request(`/admin/audit/sessions/${userId}`),
  getDailyStats: () => request('/admin/stats/daily'),
  getUserQuota: (userId: number) => request(`/admin/quotas/${userId}`),
  updateUserQuota: (userId: number, data: any) =>
    request(`/admin/quotas/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
  changeUserPassword: (userId: number, newPassword: string) =>
    request(`/admin/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({ new_password: newPassword }) }),
  deleteUser: (userId: number) =>
    request(`/admin/users/${userId}`, { method: 'DELETE' }),

  // Admin - Providers
  getProviders: () => request('/admin/providers'),
  createProvider: (data: any) => request('/admin/providers', { method: 'POST', body: JSON.stringify(data) }),
  updateProvider: (id: number, data: any) => request(`/admin/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProvider: (id: number) => request(`/admin/providers/${id}`, { method: 'DELETE' }),

  // Admin - Templates
  getAdminTemplates: () => request('/admin/templates'),
  createTemplate: (data: any) => request('/admin/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (id: number, data: any) => request(`/admin/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTemplate: (id: number) => request(`/admin/templates/${id}`, { method: 'DELETE' }),

  // Admin - Usage Dashboard
  getUsageOverview: (days = 30) => request(`/admin/usage/overview?days=${days}`),

  // Board Materials (persisted to backend, cross-device sync)
  getBoardMaterials: () => {
    if (!_boardMaterialsPromise) _boardMaterialsPromise = request('/materials/boards');
    return _boardMaterialsPromise;
  },
  preloadBoardMaterials: () => { api.getBoardMaterials(); },
  saveBoardMaterials: (materials: any[]) => {
    const p = request('/materials/boards', { method: 'PUT', body: JSON.stringify({ materials }), keepalive: true } as any);
    p.finally(() => { _boardMaterialsPromise = null; });
    return p;
  },
  getRodTubes: () => request('/materials/rods'),
  saveRodTubes: (materials: any[]) => request('/materials/rods', { method: 'PUT', body: JSON.stringify({ materials }), keepalive: true } as any),
};

export function streamChat(
  sessionId: number | null,
  message: string,
  model: string,
  lang: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): AbortController {
  const token = localStorage.getItem('token');
  const controller = new AbortController();
  fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ session_id: sessionId, message, model, lang }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || '流式请求失败');
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') { onDone(); return; }
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) onToken(parsed.content);
            } catch {}
          }
        }
      }
      onDone();
    })
    .catch(onError);
  return controller;
}
