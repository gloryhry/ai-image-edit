import React, { useEffect, useState } from 'react';
import { Save, Loader2, Eye, EyeOff, Link, Key, Globe } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';

const settingsConfig = [
  {
    key: 'redemption_purchase_link',
    label: '兑换码购买链接',
    icon: Link,
    type: 'text',
    placeholder: 'https://example.com/buy',
  },
  {
    key: 'gemini_base_url',
    label: 'Gemini API Base URL',
    icon: Globe,
    type: 'text',
    placeholder: 'https://generativelanguage.googleapis.com',
  },
  {
    key: 'gemini_api_key',
    label: 'Gemini API Key',
    icon: Key,
    type: 'password',
    placeholder: '输入 API Key',
  },
  {
    key: 'openai_base_url',
    label: 'OpenAI 兼容接口 Base URL',
    icon: Globe,
    type: 'text',
    placeholder: 'https://api.openai.com',
  },
  {
    key: 'openai_api_key',
    label: 'OpenAI 兼容接口 API Key',
    icon: Key,
    type: 'password',
    placeholder: '输入 API Key',
  },
  {
    key: 'new_user_bonus',
    label: '新用户注册赠送金额',
    icon: Key,
    type: 'number',
    placeholder: '0',
  },
];

export const SettingsPage = () => {
  const { user, isAdmin } = useAuth();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('system_settings').select('*');

    if (!error && data) {
      const settingsMap = {};
      data.forEach((s) => {
        settingsMap[s.key] = s.value;
      });
      setSettings(settingsMap);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    if (!isAdmin) {
      setSaveError('只有管理员才能修改系统设置');
      setSaving(false);
      return;
    }

    try {
      const updatePromises = Object.entries(settings).map(([key, value]) =>
        supabase
          .from('system_settings')
          .update({
            value: String(value),
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq('key', key)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter((r) => r.error);

      if (errors.length > 0) {
        console.error('保存设置失败:', errors);
        setSaveError(`保存失败: ${errors[0].error.message}`);
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('保存设置异常:', err);
      setSaveError(`保存异常: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const togglePassword = (key) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
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
        <h1 className="text-2xl font-bold text-slate-800">系统管理</h1>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存设置
        </Button>
      </div>

      {saveSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          设置已保存成功
        </div>
      )}

      {saveError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {saveError}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y">
        {settingsConfig.map((config) => (
          <div key={config.key} className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <config.icon className="w-5 h-5 text-slate-400" />
              <label className="text-sm font-medium text-slate-700">{config.label}</label>
            </div>
            <div className="relative">
              <input
                type={
                  config.type === 'password' && !showPasswords[config.key]
                    ? 'password'
                    : config.type === 'number'
                    ? 'number'
                    : 'text'
                }
                value={settings[config.key] || ''}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, [config.key]: e.target.value }))
                }
                placeholder={config.placeholder}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
              />
              {config.type === 'password' && (
                <button
                  type="button"
                  onClick={() => togglePassword(config.key)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords[config.key] ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <h4 className="font-medium text-amber-800 mb-2">注意事项</h4>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>• API Key 等敏感信息请妥善保管，不要泄露给他人</li>
          <li>• 修改设置后需要点击"保存设置"按钮才能生效</li>
          <li>• 新用户注册赠送金额设置为 0 表示不赠送</li>
        </ul>
      </div>
    </div>
  );
};
