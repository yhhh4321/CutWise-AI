import { useState, useEffect } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { useI18n } from '../i18n';
import { Users, BarChart3, FileText, ChevronRight, X, Plus, Key, Trash2, Cpu, Bot, Edit3, Check, TrendingUp } from 'lucide-react';
import Dashboard from './Dashboard';

type Tab = 'users' | 'audit' | 'stats' | 'providers' | 'templates' | 'dashboard';

export default function Admin() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div className="flex h-full">
      {/* Nav - icons only on mobile */}
      <nav className="w-12 md:w-48 shrink-0 bg-apple-card border-r border-apple-border p-1.5 md:p-3 space-y-0.5 md:space-y-1">
        <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={<TrendingUp className="w-4 h-4" />} label={t('admin.tab_dashboard')} />
        <TabBtn active={tab === 'users'} onClick={() => setTab('users')} icon={<Users className="w-4 h-4" />} label={t('admin.tab_users')} />
        <TabBtn active={tab === 'providers'} onClick={() => setTab('providers')} icon={<Cpu className="w-4 h-4" />} label={t('admin.tab_providers')} />
        <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')} icon={<Bot className="w-4 h-4" />} label={t('admin.tab_templates')} />
        <TabBtn active={tab === 'audit'} onClick={() => setTab('audit')} icon={<FileText className="w-4 h-4" />} label={t('admin.tab_audit')} />
        <TabBtn active={tab === 'stats'} onClick={() => setTab('stats')} icon={<BarChart3 className="w-4 h-4" />} label={t('admin.tab_stats')} />
      </nav>
      <div className="flex-1 overflow-auto p-3 md:p-6">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'providers' && <ProvidersPanel />}
        {tab === 'templates' && <TemplatesPanel />}
        {tab === 'audit' && <AuditPanel />}
        {tab === 'stats' && <StatsPanel />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-center md:justify-start gap-2.5 px-1.5 md:px-3 py-2 md:py-2.5 rounded-apple text-sm transition-colors ${
        active ? 'bg-apple-blue text-white' : 'text-apple-text-secondary hover:bg-apple-secondary hover:text-white'
      }`}
      title={label}
    >
      {icon} <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function UsersPanel() {
  const { t } = useI18n();
  const currentUser = useStore((s) => s.user);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<any>(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [creating, setCreating] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<any>(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadUsers = () => {
    api.getUsers().then(setUsers).finally(() => setLoading(false));
  };
  useEffect(loadUsers, []);

  const handleToggle = async () => {
    if (!confirmTarget) return;
    setError('');
    try {
      const result = await api.toggleUserActive(confirmTarget.id);
      setUsers((prev) => prev.map((x) => x.id === confirmTarget.id ? { ...x, is_active: result.is_active } : x));
    } catch (e: any) {
      setError(e.message);
    }
    setConfirmTarget(null);
  };

  const isSelf = (userId: number) => !!(currentUser && currentUser.id === userId);

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setError('');
    setCreating(true);
    try {
      await api.createUser(newUsername.trim(), newPassword.trim(), newRole);
      setShowCreate(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      loadUsers();
    } catch (e: any) {
      setError(e.message);
    }
    setCreating(false);
  };

  const handlePwdSubmit = async () => {
    if (!newPwd.trim() || newPwd.length < 6) { setPwdError(t('admin.pwd_min_error')); return; }
    setPwdError('');
    setPwdSubmitting(true);
    try {
      await api.changeUserPassword(pwdTarget.id, newPwd.trim());
      setPwdTarget(null);
      setNewPwd('');
    } catch (e: any) {
      setPwdError(e.message);
    }
    setPwdSubmitting(false);
  };

  const handleDelete = async () => {
    setDeleteError('');
    setDeleting(true);
    try {
      await api.deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      loadUsers();
    } catch (e: any) {
      setDeleteError(e.message);
    }
    setDeleting(false);
  };

  if (loading) return <p className="text-apple-text-secondary text-sm">{t('admin.loading')}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">{t('admin.users_title')}</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-apple text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
        </div>
      )}

      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="mb-4 flex items-center gap-1.5 text-xs bg-apple-blue hover:bg-blue-600 text-white px-3 py-2 rounded-apple transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t('admin.create_user')}
        </button>
      )}

      {showCreate && (
        <div className="mb-4 p-4 bg-apple-card border border-apple-border rounded-apple">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder={t('label.username')}
              className="bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue transition-colors placeholder:text-apple-text-secondary"
            />
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('label.password')}
              type="password"
              className="bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue transition-colors placeholder:text-apple-text-secondary"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue transition-colors"
            >
              <option value="user">{t('role.user')}</option>
              {currentUser?.role === 'super_admin' && <option value="admin">{t('role.admin')}</option>}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newUsername.trim() || !newPassword.trim()}
                className="flex-1 bg-apple-blue hover:bg-blue-600 text-white text-sm py-1.5 rounded-apple disabled:opacity-30 transition-colors"
              >
                {creating ? t('admin.creating') : t('btn.confirm')}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewUsername(''); setNewPassword(''); }}
                className="flex-1 bg-apple-secondary text-apple-text-secondary hover:text-white text-sm py-1.5 rounded-apple transition-colors"
              >
                {t('btn.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      {pwdTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-apple-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white">{t('admin.pwd_title')}{pwdTarget.username}</h3>
              <button onClick={() => { setPwdTarget(null); setNewPwd(''); setPwdError(''); }} className="text-apple-text-secondary hover:text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>
            {pwdError && <p className="text-red-400 text-xs mb-3">{pwdError}</p>}
            <input
              type="text" value={newPwd} onChange={e => setNewPwd(e.target.value)}
              placeholder={t('admin.pwd_placeholder')}
              className="w-full px-3 py-2.5 bg-[#2c2c2c] border border-apple-border rounded-xl text-sm text-white placeholder-apple-text-secondary focus:outline-none focus:border-apple-blue mb-5"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => { setPwdTarget(null); setNewPwd(''); setPwdError(''); }} className="flex-1 py-2 rounded-xl text-sm text-apple-text-secondary border border-apple-border hover:bg-[#2c2c2c] transition-colors">{t('btn.cancel')}</button>
              <button onClick={handlePwdSubmit} disabled={pwdSubmitting} className="flex-1 py-2 rounded-xl text-sm text-white bg-apple-blue hover:bg-blue-600 transition-colors disabled:opacity-50">{pwdSubmitting ? t('admin.changing') : t('admin.confirm_change')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-apple-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white">{t('admin.delete_user_title')}</h3>
              <button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} className="text-apple-text-secondary hover:text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-apple-text-secondary text-sm mb-3">
              {t('admin.delete_user_prefix')}<span className="text-white font-semibold">{deleteTarget.username} ({deleteTarget.email})</span>{t('admin.delete_user_suffix')}
            </p>
            {deleteError && <p className="text-red-400 text-xs mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} className="flex-1 py-2 rounded-xl text-sm text-apple-text-secondary border border-apple-border hover:bg-[#2c2c2c] transition-colors">{t('btn.cancel')}</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2 rounded-xl text-sm text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50">{deleting ? t('admin.deleting') : t('admin.confirm_delete')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-apple-card rounded-apple border border-apple-border overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-apple-border text-apple-text-secondary text-xs">
              <th className="text-left p-4">{t('label.username')}</th>
              <th className="text-left p-4">{t('admin.th_role')}</th>
              <th className="text-left p-4">{t('admin.th_status')}</th>
              <th className="text-left p-4">{t('admin.th_registered')}</th>
              <th className="text-right p-4">{t('admin.th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-apple-border/50 last:border-0 hover:bg-apple-secondary/30">
                <td className="p-4 text-white">
                  {u.username}
                  {isSelf(u.id) && <span className="text-apple-blue text-xs ml-2">({t('admin.current_user')})</span>}
                </td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    u.role === 'super_admin' ? 'bg-purple-500/20 text-purple-400' :
                    u.role === 'admin' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {u.role === 'super_admin' ? t('role.super_admin') : u.role === 'admin' ? t('role.admin') : t('role.user')}
                  </span>
                </td>
                <td className="p-4">
                  <span className={`w-2 h-2 rounded-full inline-block mr-1.5 ${u.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-apple-text-secondary text-xs">{u.is_active ? t('admin.status_enabled') : t('admin.status_disabled')}</span>
                </td>
                <td className="p-4 text-apple-text-secondary text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}</td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => { setPwdTarget(u); setNewPwd(''); setPwdError(''); }}
                      disabled={isSelf(u.id)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${
                        isSelf(u.id)
                          ? 'bg-gray-500/10 text-gray-600 cursor-not-allowed'
                          : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                      }`}
                    >
                      <Key className="w-3 h-3" /> {t('admin.password')}
                    </button>
                    <button
                      onClick={() => setConfirmTarget(u)}
                      disabled={isSelf(u.id)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        isSelf(u.id)
                          ? 'bg-gray-500/10 text-gray-600 cursor-not-allowed'
                          : u.is_active
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                            : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                      }`}
                    >
                      {u.is_active ? t('admin.disable') : t('admin.enable')}
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(u); setDeleteError(''); }}
                      disabled={isSelf(u.id)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${
                        isSelf(u.id)
                          ? 'bg-gray-500/10 text-gray-600 cursor-not-allowed'
                          : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" /> {t('btn.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 确认弹窗 */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmTarget(null)}>
          <div className="bg-apple-card rounded-2xl w-full max-w-sm overflow-hidden border border-apple-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-base font-semibold text-white mb-2">
                {confirmTarget.is_active ? t('admin.confirm_disable') : t('admin.confirm_enable')}
              </h3>
              <p className="text-apple-text-secondary text-sm">
                {confirmTarget.is_active
                  ? t('admin.disable_confirm_prefix') + confirmTarget.username + t('admin.disable_confirm_suffix')
                  : t('admin.enable_confirm_prefix') + confirmTarget.username + t('admin.enable_confirm_suffix')}
              </p>
            </div>
            <div className="flex border-t border-apple-border">
              <button onClick={() => setConfirmTarget(null)} className="flex-1 py-3 text-sm text-apple-text-secondary hover:text-white hover:bg-apple-secondary/50 transition-colors">
                {t('btn.cancel')}
              </button>
              <button onClick={handleToggle} className={`flex-1 py-3 text-sm font-medium border-l border-apple-border transition-colors ${
                confirmTarget.is_active ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'
              }`}>
                {t('btn.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditPanel() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [userMessages, setUserMessages] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    api.getAuditLogs({ page_size: '50' }).then((r) => {
      setLogs(r.items);
      setLoading(false);
    });
  }, []);

  const viewSessions = async (userId: number) => {
    setSelectedUser(userId);
    const msgs = await api.getUserSessions(userId);
    setUserMessages(msgs);
    setShowDialog(true);
  };

  if (loading) return <p className="text-apple-text-secondary text-sm">{t('admin.loading')}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">{t('admin.audit_title')}</h2>
      <div className="bg-apple-card rounded-apple border border-apple-border overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-apple-border text-apple-text-secondary text-xs">
              <th className="text-left p-4">{t('admin.th_time')}</th>
              <th className="text-left p-4">{t('admin.th_user_id')}</th>
              <th className="text-left p-4">{t('admin.th_action')}</th>
              <th className="text-left p-4">{t('admin.th_model')}</th>
              <th className="text-left p-4">{t('admin.th_role')}</th>
              <th className="text-left p-4">{t('admin.th_content_preview')}</th>
              <th className="text-right p-4">{t('admin.th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-apple-border/50 last:border-0 hover:bg-apple-secondary/30">
                <td className="p-4 text-apple-text-secondary text-xs">{l.created_at ? new Date(l.created_at).toLocaleString('zh-CN') : '-'}</td>
                <td className="p-4 text-white">{l.user_id}</td>
                <td className="p-4 text-white">{l.action}</td>
                <td className="p-4 text-apple-text-secondary text-xs">{l.model_name || '-'}</td>
                <td className="p-4">
                  <span className={`text-xs ${l.role === 'user' ? 'text-apple-blue' : 'text-green-400'}`}>
                    {l.role === 'user' ? t('role.user') : 'AI'}
                  </span>
                </td>
                <td className="p-4 text-apple-text-secondary text-xs truncate max-w-[200px]">{l.content_preview || '-'}</td>
                <td className="p-4 text-right">
                  <button onClick={() => viewSessions(l.user_id)} className="text-apple-blue text-xs hover:underline">{t('admin.view_chat')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 对话详情弹窗 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDialog(false)}>
          <div className="bg-apple-card rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-apple-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-apple-border">
              <h3 className="text-sm font-semibold text-white">{t('admin.user_chat_history', { id: selectedUser ?? '' })}</h3>
              <button onClick={() => setShowDialog(false)} className="text-apple-text-secondary hover:text-white p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)] space-y-4">
              {userMessages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    m.role === 'user' ? 'bg-apple-blue text-white rounded-tr-md' : 'bg-apple-secondary text-white rounded-tl-md'
                  }`}>
                    <p className="text-[11px] text-white/60 mb-1">
                      {m.role === 'user' ? t('role.user') : 'AI'} · {m.model_name || ''} · {m.tokens} tokens
                    </p>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsPanel() {
  const { t } = useI18n();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDailyStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-apple-text-secondary text-sm">{t('admin.loading')}</p>;
  if (!stats) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">{t('admin.stats_title')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatCard label={t('admin.stats_active_users')} value={stats.total_users} />
        <StatCard label={t('admin.stats_sessions')} value={stats.total_sessions} />
        <StatCard label={t('admin.stats_messages')} value={stats.total_messages} />
        <StatCard label={t('admin.stats_tokens')} value={stats.total_tokens.toLocaleString()} />
      </div>
      <div className="bg-apple-card rounded-apple border border-apple-border p-5">
        <h3 className="text-sm font-semibold text-white mb-3">{t('admin.stats_by_model')}</h3>
        {Object.entries(stats.by_model || {}).length > 0 ? (
          <div className="space-y-3">
            {(Object.entries(stats.by_model) as [string, number][]).map(([model, count]) => (
              <div key={model} className="flex items-center gap-3">
                <span className="text-sm text-white w-40 truncate">{model}</span>
                <div className="flex-1 bg-apple-secondary rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full bg-apple-blue rounded-full"
                    style={{ width: `${Math.min(100, (count / (stats.total_messages || 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-apple-text-secondary w-10 text-right">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-apple-text-secondary text-sm">{t('admin.stats_no_data')}</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-apple-card rounded-apple border border-apple-border p-5">
      <p className="text-apple-text-secondary text-xs mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

// ======================== 模型库管理 ========================
function ProvidersPanel() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState('');

  const load = () => {
    api.getProviders().then(setProviders).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const resetForm = () => {
    setName(''); setBaseUrl(''); setApiKey(''); setModels(''); setEditId(null); setShowForm(false); setError('');
  };

  const openCreate = () => { resetForm(); setShowForm(true); };
  const openEdit = (p: any) => {
    setName(p.name); setBaseUrl(p.base_url); setApiKey(p.api_key_encrypted || '');
    setModels((p.models || []).join(', ')); setEditId(p.id); setShowForm(true); setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) { setError(t('admin.provider_required')); return; }
    const modelsArr = models.split(',').map(m => m.trim()).filter(Boolean);
    setError('');
    try {
      if (editId) {
        await api.updateProvider(editId, { name: name.trim(), base_url: baseUrl.trim(), api_key: apiKey.trim(), models: modelsArr });
      } else {
        await api.createProvider({ name: name.trim(), base_url: baseUrl.trim(), api_key: apiKey.trim(), models: modelsArr });
      }
      resetForm();
      load();
    } catch (e: any) { setError(e.message); }
  };

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleDelete = (id: number) => setDeleteId(id);
  const confirmDelete = async () => {
    if (deleteId === null) return;
    try { await api.deleteProvider(deleteId); setDeleteId(null); load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <p className="text-apple-text-secondary text-sm">{t('admin.loading')}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">{t('admin.tab_providers')}</h2>

      {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-apple text-red-400 text-sm flex items-center justify-between"><span>{error}</span><button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button></div>}

      {!showForm && (
        <button onClick={openCreate} className="mb-4 flex items-center gap-1.5 text-xs bg-apple-blue hover:bg-blue-600 text-white px-3 py-2 rounded-apple transition-colors">
          <Plus className="w-3.5 h-3.5" /> {t('admin.add_provider')}
        </button>
      )}

      {showForm && (
        <div className="mb-4 p-4 bg-apple-card border border-apple-border rounded-apple space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('admin.provider_name_placeholder')} className="bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue placeholder:text-apple-text-secondary" />
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={t('admin.provider_url_placeholder')} className="bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue placeholder:text-apple-text-secondary" />
          </div>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={t('admin.provider_key_placeholder')} type="password" className="w-full bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue placeholder:text-apple-text-secondary" />
          <input value={models} onChange={e => setModels(e.target.value)} placeholder={t('admin.provider_models_placeholder')} className="w-full bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue placeholder:text-apple-text-secondary" />
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="flex-1 bg-apple-blue hover:bg-blue-600 text-white text-sm py-2 rounded-apple transition-colors">{editId ? t('admin.save_changes') : t('admin.confirm_add')}</button>
            <button onClick={resetForm} className="flex-1 bg-apple-secondary text-apple-text-secondary hover:text-white text-sm py-2 rounded-apple transition-colors">{t('btn.cancel')}</button>
          </div>
        </div>
      )}

      <div className="bg-apple-card rounded-apple border border-apple-border overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-apple-border text-apple-text-secondary text-xs">
              <th className="text-left p-4">{t('admin.th_name')}</th>
              <th className="text-left p-4">{t('admin.th_api_url')}</th>
              <th className="text-left p-4">{t('admin.th_model')}</th>
              <th className="text-left p-4">{t('admin.th_status')}</th>
              <th className="text-right p-4">{t('admin.th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-b border-apple-border/50 last:border-0 hover:bg-apple-secondary/30">
                <td className="p-4 text-white font-medium">{p.name}</td>
                <td className="p-4 text-apple-text-secondary text-xs truncate max-w-[200px]">{p.base_url}</td>
                <td className="p-4 text-apple-text-secondary text-xs">{(p.models || []).join(', ')}</td>
                <td className="p-4"><span className="w-2 h-2 rounded-full inline-block mr-1.5 bg-green-500" /><span className="text-apple-text-secondary text-xs">{t('admin.status_enabled')}</span></td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => openEdit(p)} className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"><Edit3 className="w-3 h-3" /> {t('btn.edit')}</button>
                    <button onClick={() => handleDelete(p.id)} className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"><Trash2 className="w-3 h-3" /> {t('btn.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
            {providers.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-apple-text-secondary text-sm">{t('admin.no_providers')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeleteId(null)}>
          <div className="bg-apple-card border border-apple-border rounded-xl p-6 w-[340px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-2">{t('admin.confirm_delete')}</h3>
            <p className="text-apple-text-secondary text-sm mb-5">{t('admin.delete_provider_confirm')}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="text-sm px-4 py-2 rounded-apple bg-apple-secondary text-apple-text-secondary hover:text-white transition-colors">{t('btn.cancel')}</button>
              <button onClick={confirmDelete} className="text-sm px-4 py-2 rounded-apple bg-red-500 hover:bg-red-600 text-white transition-colors">{t('admin.confirm_delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================== 对话模板管理 ========================
function TemplatesPanel() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [providerId, setProviderId] = useState<number | ''>('');
  const [modelName, setModelName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const load = async () => {
    try {
      const [t, p] = await Promise.all([api.getAdminTemplates(), api.getProviders()]);
      setTemplates(t); setProviders(p);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setName(''); setProviderId(''); setModelName(''); setSystemPrompt(''); setEditId(null); setShowForm(false); setError(''); setAvailableModels([]);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };
  const openEdit = (tmpl: any) => {
    setName(tmpl.name); setProviderId(tmpl.provider_id || ''); setModelName(tmpl.model_name);
    setSystemPrompt(tmpl.system_prompt); setEditId(tmpl.id); setShowForm(true); setError('');
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pid = e.target.value ? Number(e.target.value) : '';
    setProviderId(pid);
    if (pid) {
      const provider = providers.find(p => p.id === pid);
      setAvailableModels(provider?.models || []);
      setModelName('');
    } else {
      setAvailableModels([]);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !providerId || !modelName.trim()) {
      setError(t('admin.template_required')); return;
    }
    setError('');
    try {
      if (editId) {
        await api.updateTemplate(editId, { name: name.trim(), provider_id: providerId, model_name: modelName.trim(), system_prompt: systemPrompt });
      } else {
        await api.createTemplate({ name: name.trim(), provider_id: providerId as number, model_name: modelName.trim(), system_prompt: systemPrompt });
      }
      resetForm();
      load();
    } catch (e: any) { setError(e.message); }
  };

  const handleDelete = (id: number) => setDeleteId(id);
  const confirmDelete = async () => {
    if (deleteId === null) return;
    try { await api.deleteTemplate(deleteId); setDeleteId(null); load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <p className="text-apple-text-secondary text-sm">{t('admin.loading')}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">{t('admin.tab_templates')}</h2>

      {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-apple text-red-400 text-sm flex items-center justify-between"><span>{error}</span><button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button></div>}

      {!showForm && (
        <button onClick={openCreate} className="mb-4 flex items-center gap-1.5 text-xs bg-apple-blue hover:bg-blue-600 text-white px-3 py-2 rounded-apple transition-colors">
          <Plus className="w-3.5 h-3.5" /> {t('admin.create_template')}
        </button>
      )}

      {showForm && (
        <div className="mb-4 p-4 bg-apple-card border border-apple-border rounded-apple space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('admin.template_name_placeholder')} className="w-full bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue placeholder:text-apple-text-secondary" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select value={providerId} onChange={handleProviderChange} className="bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue">
              <option value="">{t('admin.select_provider')}</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={modelName} onChange={e => setModelName(e.target.value)} disabled={!providerId} className="bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue disabled:opacity-40">
              <option value="">{t('admin.select_model')}</option>
              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <textarea
            value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
            placeholder={t('admin.system_prompt_placeholder')}
            rows={4}
            className="w-full bg-apple-secondary text-white text-sm px-3 py-2 rounded-apple outline-none border border-transparent focus:border-apple-blue placeholder:text-apple-text-secondary resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="flex-1 bg-apple-blue hover:bg-blue-600 text-white text-sm py-2 rounded-apple transition-colors">{editId ? t('admin.save_changes') : t('admin.create_template_btn')}</button>
            <button onClick={resetForm} className="flex-1 bg-apple-secondary text-apple-text-secondary hover:text-white text-sm py-2 rounded-apple transition-colors">{t('btn.cancel')}</button>
          </div>
        </div>
      )}

      <div className="bg-apple-card rounded-apple border border-apple-border overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-apple-border text-apple-text-secondary text-xs">
              <th className="text-left p-4">{t('admin.th_template_name')}</th>
              <th className="text-left p-4">{t('admin.th_provider')}</th>
              <th className="text-left p-4">{t('admin.th_model')}</th>
              <th className="text-left p-4">{t('admin.th_prompt_preview')}</th>
              <th className="text-right p-4">{t('admin.th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tmpl: any) => (
              <tr key={tmpl.id} className="border-b border-apple-border/50 last:border-0 hover:bg-apple-secondary/30">
                <td className="p-4 text-white font-medium">{tmpl.name}</td>
                <td className="p-4 text-apple-text-secondary text-xs">{tmpl.provider_name || tmpl.provider_id}</td>
                <td className="p-4 text-apple-text-secondary text-xs">{tmpl.model_name}</td>
                <td className="p-4 text-apple-text-secondary text-xs truncate max-w-[250px]">{tmpl.system_prompt || '-'}</td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => openEdit(tmpl)} className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"><Edit3 className="w-3 h-3" /> {t('btn.edit')}</button>
                    <button onClick={() => handleDelete(tmpl.id)} className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"><Trash2 className="w-3 h-3" /> {t('btn.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-apple-text-secondary text-sm">{t('admin.no_templates')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeleteId(null)}>
          <div className="bg-apple-card border border-apple-border rounded-xl p-6 w-[340px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-2">{t('admin.confirm_delete')}</h3>
            <p className="text-apple-text-secondary text-sm mb-5">{t('admin.delete_template_confirm')}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="text-sm px-4 py-2 rounded-apple bg-apple-secondary text-apple-text-secondary hover:text-white transition-colors">{t('btn.cancel')}</button>
              <button onClick={confirmDelete} className="text-sm px-4 py-2 rounded-apple bg-red-500 hover:bg-red-600 text-white transition-colors">{t('admin.confirm_delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
