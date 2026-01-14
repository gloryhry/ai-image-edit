import React, { useEffect, useState } from 'react';
import { Wallet, ArrowUpCircle, ArrowDownCircle, Gift, Loader2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { withSessionRefresh } from '../../lib/supabase-request';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';

export const WalletPage = () => {
  const { profile, refreshProfile } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState(null);
  const [purchaseLink, setPurchaseLink] = useState('');

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await withSessionRefresh(async () => {
      return supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(100);
    });

    if (fetchError) {
      console.error('Failed to fetch transactions:', fetchError);
      setError('加载交易记录失败，请点击刷新重试');
    } else {
      setTransactions(data || []);
    }
    setLoading(false);
  };

  const fetchPurchaseLink = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'redemption_purchase_link')
      .single();

    if (data?.value) {
      setPurchaseLink(data.value);
    }
  };

  useEffect(() => {
    if (profile?.id) {
      fetchTransactions();
      fetchPurchaseLink();
    }
  }, [profile?.id]);

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;

    setRedeeming(true);
    setRedeemResult(null);

    const { data, error } = await supabase.rpc('redeem_code', {
      p_code: redeemCode.trim(),
    });

    if (error) {
      setRedeemResult({ success: false, message: error.message });
    } else {
      setRedeemResult(data);
      if (data.success) {
        setRedeemCode('');
        await refreshProfile();
        fetchTransactions();
      }
    }

    setRedeeming(false);
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'recharge':
        return <ArrowUpCircle className="w-5 h-5 text-green-500" />;
      case 'consume':
        return <ArrowDownCircle className="w-5 h-5 text-red-500" />;
      case 'refund':
        return <Gift className="w-5 h-5 text-blue-500" />;
      case 'admin_adjust':
        return <Wallet className="w-5 h-5 text-purple-500" />;
      default:
        return <Wallet className="w-5 h-5 text-slate-500" />;
    }
  };

  const getTransactionLabel = (type) => {
    switch (type) {
      case 'recharge':
        return '充值';
      case 'consume':
        return '消费';
      case 'refund':
        return '退款';
      case 'admin_adjust':
        return '管理员调整';
      default:
        return type;
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
        <h1 className="text-2xl font-bold text-slate-800">钱包管理</h1>
        <button
          onClick={() => { fetchTransactions(); refreshProfile(); }}
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
            onClick={fetchTransactions}
            className="ml-auto px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
          <p className="text-blue-100 text-sm mb-1">当前余额</p>
          <p className="text-4xl font-bold">¥{Number(profile?.balance || 0).toFixed(4)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white">
          <p className="text-amber-100 text-sm mb-1">历史消耗</p>
          <p className="text-4xl font-bold">¥{Number(profile?.total_spent || 0).toFixed(4)}</p>
        </div>
      </div>

      {/* Redeem Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Gift className="w-5 h-5 text-purple-500" />
          兑换码充值
        </h3>

        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">输入兑换码</label>
            <input
              type="text"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-4 py-2 border rounded-lg font-mono"
            />
          </div>
          <Button
            onClick={handleRedeem}
            disabled={redeeming || !redeemCode.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
          >
            {redeeming && <Loader2 className="w-4 h-4 animate-spin" />}
            兑换
          </Button>
        </div>

        {redeemResult && (
          <div
            className={`mt-4 p-3 rounded-lg ${redeemResult.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
              }`}
          >
            {redeemResult.message}
            {redeemResult.success && (
              <span className="ml-2 font-semibold">充值金额: ¥{redeemResult.amount}</span>
            )}
          </div>
        )}

        {purchaseLink && (
          <a
            href={purchaseLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            购买兑换码
          </a>
        )}
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">交易记录</h3>
        </div>
        <div className="divide-y">
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">暂无交易记录</div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  {getTransactionIcon(tx.type)}
                  <div>
                    <p className="font-medium text-slate-800">{tx.description || getTransactionLabel(tx.type)}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(tx.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`font-bold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                  >
                    {tx.amount >= 0 ? '+' : ''}
                    {Number(tx.amount).toFixed(4)}
                  </p>
                  <p className="text-sm text-slate-400">余额: ¥{Number(tx.balance_after).toFixed(4)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
