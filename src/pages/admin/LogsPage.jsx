import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, Filter, Loader2, CheckCircle, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { withSessionRefresh } from '../../lib/supabase-request';
import { useAuth } from '../../contexts/AuthContext';

export const LogsPage = () => {
  console.log('[LogsPage] Component rendering...');

  const { isAdmin, user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [models, setModels] = useState([]);

  // 用于追踪请求状态，避免重复请求
  const fetchingRef = useRef(false);
  // 用于追踪页面是否需要刷新
  const needsRefreshRef = useRef(false);
  // 用于追踪组件是否已挂载（防止在恢复流程中执行非法操作）
  const mountedRef = useRef(true);

  console.log('[LogsPage] Auth state:', { isAdmin, userId: user?.id, authLoading });

  const fetchLogs = useCallback(async (force = false) => {
    // 防止重复请求
    if (fetchingRef.current && !force) {
      console.log('[LogsPage] fetchLogs skipped - already fetching');
      return;
    }

    // 如果认证还在加载中，跳过请求
    if (authLoading) {
      console.log('[LogsPage] fetchLogs skipped - auth loading');
      needsRefreshRef.current = true;
      return;
    }

    console.log('[LogsPage] fetchLogs called');
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await withSessionRefresh(async () => {
        console.log('[LogsPage] Building query...');
        let query = supabase
          .from('usage_logs')
          .select('*, profiles:user_id(email)')
          .order('created_at', { ascending: false })
          .limit(500);

        if (!isAdmin) {
          query = query.eq('user_id', user.id);
        }

        if (filterModel) {
          query = query.eq('model_name', filterModel);
        }

        if (filterStatus !== 'all') {
          query = query.eq('is_success', filterStatus === 'success');
        }

        console.log('[LogsPage] Executing query...');
        return query;
      });

      console.log('[LogsPage] Query result:', { hasData: !!data, hasError: !!fetchError });

      if (fetchError) {
        console.error('[LogsPage] Failed to fetch logs:', fetchError);
        setError('加载日志失败，请点击刷新重试');
      } else {
        setLogs(data || []);
        setError(null);
      }
    } catch (e) {
      console.error('[LogsPage] Exception in fetchLogs:', e);
      setError('加载日志失败: ' + e.message);
    }

    setLoading(false);
    fetchingRef.current = false;
  }, [isAdmin, user?.id, filterModel, filterStatus, authLoading]);

  const fetchModels = async () => {
    console.log('[LogsPage] fetchModels called');
    const { data } = await supabase.from('models').select('name, display_name');
    if (data) {
      setModels(data);
    }
  };

  useEffect(() => {
    console.log('[LogsPage] useEffect[] triggered - fetching models');
    fetchModels();
  }, []);

  // 当认证完成后，检查是否需要刷新
  useEffect(() => {
    if (!authLoading && needsRefreshRef.current) {
      console.log('[LogsPage] Auth completed, triggering delayed fetch');
      needsRefreshRef.current = false;
      fetchLogs();
    }
  }, [authLoading, fetchLogs]);

  useEffect(() => {
    // 只有在认证完成后才发起请求
    if (!authLoading) {
      console.log('[LogsPage] useEffect[filterModel, filterStatus, isAdmin] triggered - fetching logs');
      fetchLogs();
    }
  }, [filterModel, filterStatus, isAdmin, authLoading, fetchLogs]);

  // 监听页面可见性变化，页面恢复时重新加载数据
  useEffect(() => {
    let lastHiddenTime = 0;
    let refreshTimeoutId = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTime = Date.now();
      } else if (document.visibilityState === 'visible') {
        const hiddenDuration = Date.now() - lastHiddenTime;
        console.log('[LogsPage] Page became visible after', hiddenDuration, 'ms');

        // 清除之前的刷新定时器
        if (refreshTimeoutId) {
          clearTimeout(refreshTimeoutId);
        }

        // Supabase 客户端会在 visibilitychange 时自动恢复连接
        // 等待 500ms 让恢复流程完成，然后刷新数据
        refreshTimeoutId = setTimeout(() => {
          if (!authLoading && mountedRef.current) {
            console.log('[LogsPage] Refreshing data after visibility change');
            fetchLogs(true); // force refresh
          }
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }
      mountedRef.current = false;
    };
  }, [authLoading, fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.model_name?.toLowerCase().includes(s) ||
      log.profiles?.email?.toLowerCase().includes(s) ||
      log.ip_address?.includes(s)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">使用日志</h1>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button
            onClick={fetchLogs}
            className="ml-auto px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">搜索</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索用户、模型、IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">模型</label>
            <select
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              className="px-3 py-2 border rounded-lg min-w-[150px]"
            >
              <option value="">全部模型</option>
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">状态</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">全部</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-slate-500">总调用次数</p>
          <p className="text-2xl font-bold text-slate-800">{logs.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-slate-500">成功次数</p>
          <p className="text-2xl font-bold text-green-600">{logs.filter((l) => l.is_success).length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-slate-500">失败次数</p>
          <p className="text-2xl font-bold text-red-600">{logs.filter((l) => !l.is_success).length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-slate-500">总消费</p>
          <p className="text-2xl font-bold text-blue-600">
            ¥{logs.reduce((sum, l) => sum + Number(l.cost || 0), 0).toFixed(4)}
          </p>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                {isAdmin && <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">用户</th>}
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">模型</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">操作类型</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">消费</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">IP</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">错误信息</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">时间</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="border-b hover:bg-slate-50">
                  {isAdmin && (
                    <td className="px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-slate-700">{log.profiles?.email || '-'}</p>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm font-mono">{log.model_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${log.action_type === 'generate'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                        }`}
                    >
                      {log.action_type === 'generate' ? '生成' : '编辑'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-amber-600">
                    ¥{Number(log.cost).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 font-mono">{log.ip_address || '-'}</td>
                  <td className="px-4 py-3">
                    {log.is_success ? (
                      <span className="flex items-center gap-1 text-green-600 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        成功
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-600 text-sm">
                        <XCircle className="w-4 h-4" />
                        失败
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-red-500 max-w-[200px] truncate" title={log.error_message}>
                    {log.error_message || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(log.created_at).toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12 text-slate-500">暂无日志</div>
        )}
      </div>
    </div>
  );
};
