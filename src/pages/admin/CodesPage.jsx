import React, { useEffect, useState } from 'react';
import { Plus, Copy, Check, Loader2, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';

export const CodesPage = () => {
  const { user } = useAuth();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [amount, setAmount] = useState(10);
  const [count, setCount] = useState(1);
  const [copiedId, setCopiedId] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchCodes = async () => {
    setLoading(true);
    let query = supabase
      .from('redemption_codes')
      .select('*, used_by_profile:profiles!redemption_codes_used_by_fkey(email, username)')
      .order('created_at', { ascending: false });

    if (filter === 'used') {
      query = query.eq('is_used', true);
    } else if (filter === 'unused') {
      query = query.eq('is_used', false);
    }

    const { data, error } = await query;
    if (!error) {
      setCodes(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCodes();
  }, [filter]);

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);

    const newCodes = [];
    for (let i = 0; i < count; i++) {
      newCodes.push({
        code: generateUUID(),
        amount: amount,
        is_used: false,
        created_by: user.id,
      });
    }

    const { error } = await supabase.from('redemption_codes').insert(newCodes);

    if (!error) {
      fetchCodes();
    }
    setGenerating(false);
  };

  const copyToClipboard = async (code, id) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportUnused = () => {
    const unused = codes.filter((c) => !c.is_used);
    const text = unused.map((c) => `${c.code}\t¥${c.amount}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `兑换码_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        <h1 className="text-2xl font-bold text-slate-800">兑换码管理</h1>
      </div>

      {/* Generate Form */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">批量生成兑换码</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">金额 (元)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value))}
              className="px-3 py-2 border rounded-lg w-32"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">数量</label>
            <input
              type="number"
              min="1"
              max="100"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg w-24"
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            生成兑换码
          </Button>
          <Button
            onClick={exportUnused}
            className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg"
          >
            <Download className="w-4 h-4" />
            导出未使用
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['all', 'unused', 'used'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border'
            }`}
          >
            {f === 'all' ? '全部' : f === 'unused' ? '未使用' : '已使用'}
          </button>
        ))}
      </div>

      {/* Codes Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">兑换码</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">金额</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">状态</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">使用者</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">使用时间</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">创建时间</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-sm">{code.code}</td>
                <td className="px-4 py-3 text-sm font-medium text-green-600">¥{Number(code.amount).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      code.is_used ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {code.is_used ? '已使用' : '未使用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {code.used_by_profile?.username || code.used_by_profile?.email || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {code.used_at ? new Date(code.used_at).toLocaleString('zh-CN') : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {new Date(code.created_at).toLocaleString('zh-CN')}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => copyToClipboard(code.code, code.id)}
                    className="p-1 text-slate-600 hover:bg-slate-100 rounded"
                    title="复制"
                  >
                    {copiedId === code.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {codes.length === 0 && (
          <div className="text-center py-12 text-slate-500">暂无兑换码</div>
        )}
      </div>
    </div>
  );
};
