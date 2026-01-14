import React, { useEffect, useState } from 'react';
import { Search, Ban, Unlock, Pencil, Save, X, Loader2, KeyRound, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { withSessionRefresh } from '../../lib/supabase-request';

export const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBalance, setEditBalance] = useState(0);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await withSessionRefresh(async () => {
      return supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
    });

    if (fetchError) {
      console.error('Failed to fetch users:', fetchError);
      setError('加载用户列表失败，请点击刷新重试');
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(
    (u) =>
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleBan = async (user) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: !user.is_banned, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (!error) {
      fetchUsers();
    }
  };

  const handleEditBalance = (user) => {
    setEditingId(user.id);
    setEditBalance(user.balance);
  };

  const handleSaveBalance = async (userId) => {
    setSaving(true);
    const oldUser = users.find((u) => u.id === userId);
    const diff = editBalance - oldUser.balance;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: editBalance, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (!updateError && diff !== 0) {
      await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'admin_adjust',
        amount: diff,
        balance_after: editBalance,
        description: `管理员调整余额 ${diff >= 0 ? '+' : ''}${diff}`,
      });
    }

    setEditingId(null);
    setSaving(false);
    fetchUsers();
  };

  const handleResetPassword = async (user) => {
    if (!confirm(`确定要重置用户 ${user.email} 的密码吗？将发送重置邮件到该邮箱。`)) return;

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      alert('发送重置邮件失败: ' + error.message);
    } else {
      alert('密码重置邮件已发送');
    }
  };

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
        <h1 className="text-2xl font-bold text-slate-800">用户管理</h1>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索用户..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg w-64"
            />
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button
            onClick={fetchUsers}
            className="ml-auto px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-slate-500">总用户数</p>
          <p className="text-2xl font-bold text-slate-800">{users.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-slate-500">活跃用户</p>
          <p className="text-2xl font-bold text-green-600">{users.filter((u) => !u.is_banned).length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-slate-500">封禁用户</p>
          <p className="text-2xl font-bold text-red-600">{users.filter((u) => u.is_banned).length}</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">用户名</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">邮箱</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">余额</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">累计消费</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">角色</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">状态</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">注册时间</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium">{user.username || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{user.email}</td>
                <td className="px-4 py-3">
                  {editingId === user.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.0001"
                        value={editBalance}
                        onChange={(e) => setEditBalance(parseFloat(e.target.value))}
                        className="w-24 px-2 py-1 border rounded text-sm"
                      />
                      <button
                        onClick={() => handleSaveBalance(user.id)}
                        disabled={saving}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-slate-600 hover:bg-slate-100 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-green-600 font-medium">¥{Number(user.balance).toFixed(4)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">¥{Number(user.total_spent).toFixed(4)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${user.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                      }`}
                  >
                    {user.is_admin ? '管理员' : '普通用户'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${user.is_banned ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}
                  >
                    {user.is_banned ? '已封禁' : '正常'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {new Date(user.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEditBalance(user)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      title="修改余额"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleBan(user)}
                      className={`p-1 rounded ${user.is_banned
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-red-600 hover:bg-red-50'
                        }`}
                      title={user.is_banned ? '解除封禁' : '封禁用户'}
                    >
                      {user.is_banned ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleResetPassword(user)}
                      className="p-1 text-amber-600 hover:bg-amber-50 rounded"
                      title="重置密码"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12 text-slate-500">暂无用户</div>
        )}
      </div>
    </div>
  );
};
