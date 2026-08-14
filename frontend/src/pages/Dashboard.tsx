import { useState, useEffect } from 'react';
import { api } from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { RefreshCw, Zap, DollarSign, Calendar, MessageSquare } from 'lucide-react';

const COLORS = ['#007AFF', '#5856D6', '#FF9500', '#FF3B30', '#34C759', '#AF52DE', '#5AC8FA', '#FF2D55'];

function formatTokens(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(n: number) {
  if (n >= 1) return '$' + n.toFixed(2);
  return '$' + n.toFixed(4);
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);

  const load = () => {
    setLoading(true);
    setError('');
    api.getUsageOverview(days)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [days]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-apple" />)}
        </div>
        <div className="skeleton h-64 rounded-apple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-3">{error}</p>
        <button onClick={load} className="text-apple-blue text-sm hover:underline">重试</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">用量仪表盘</h2>
        <div className="flex items-center gap-2">
          {[7, 15, 30, 60].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-apple-blue text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {d}天
            </button>
          ))}
          <button onClick={load} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors" title="刷新">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<MessageSquare className="w-4 h-4" />} label="总消息数" value={data.total_messages.toLocaleString()} />
        <KpiCard icon={<Zap className="w-4 h-4" />} label="总 Token" value={formatTokens(data.total_tokens)} />
        <KpiCard icon={<DollarSign className="w-4 h-4" />} label="预估费用" value={formatCost(data.total_cost)} />
        <KpiCard icon={<Calendar className="w-4 h-4" />} label="活跃天数" value={`${data.active_days} 天`} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Trend */}
        <ChartCard title="每日趋势">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                }}
              />
              <Bar dataKey="tokens" fill="#007AFF" radius={[4, 4, 0, 0]} name="Token" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Model Distribution */}
        <ChartCard title="模型用量分布">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.models}
                dataKey="tokens"
                nameKey="model"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }: any) => `${String(name).split('/').pop()?.slice(0, 12)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'var(--text-secondary)', strokeWidth: 1 }}
              >
                {data.models.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Model Details Table */}
      <ChartCard title="模型明细">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-[var(--border-primary)]">
                <th className="text-left py-2.5 px-3 text-[var(--text-secondary)] font-medium text-xs">模型</th>
                <th className="text-right py-2.5 px-3 text-[var(--text-secondary)] font-medium text-xs">消息数</th>
                <th className="text-right py-2.5 px-3 text-[var(--text-secondary)] font-medium text-xs">Token</th>
                <th className="text-right py-2.5 px-3 text-[var(--text-secondary)] font-medium text-xs">用户数</th>
                <th className="text-right py-2.5 px-3 text-[var(--text-secondary)] font-medium text-xs">预估费用</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m: any) => (
                <tr key={m.model} className="border-b border-[var(--border-primary)]/50 hover:bg-[var(--hover-bg)] transition-colors">
                  <td className="py-2.5 px-3 text-[var(--text-primary)] font-mono text-xs">{m.model}</td>
                  <td className="py-2.5 px-3 text-right text-[var(--text-secondary)]">{m.messages.toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right text-[var(--text-primary)]">{formatTokens(m.tokens)}</td>
                  <td className="py-2.5 px-3 text-right text-[var(--text-secondary)]">{m.users}</td>
                  <td className="py-2.5 px-3 text-right text-apple-blue font-medium">{formatCost(m.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{title}</h3>
      {children}
    </div>
  );
}
