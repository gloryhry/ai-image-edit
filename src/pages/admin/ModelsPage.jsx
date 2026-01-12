import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Save, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

const defaultModel = {
  name: '',
  display_name: '',
  provider: 'openai_compat',
  price_per_call: 0.01,
  api_method: 'both',
  supported_resolutions: ['1024x1024'],
  supported_aspect_ratios: ['1:1'],
  is_active: true,
  description: '',
};

export const ModelsPage = () => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModel, setNewModel] = useState(defaultModel);
  const [saving, setSaving] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error) {
      setModels(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleEdit = (model) => {
    setEditingId(model.id);
    setEditForm({
      ...model,
      supported_resolutions: model.supported_resolutions?.join(', ') || '',
      supported_aspect_ratios: model.supported_aspect_ratios?.join(', ') || '',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('models')
      .update({
        ...editForm,
        supported_resolutions: editForm.supported_resolutions.split(',').map((s) => s.trim()).filter(Boolean),
        supported_aspect_ratios: editForm.supported_aspect_ratios.split(',').map((s) => s.trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingId);

    if (!error) {
      setEditingId(null);
      fetchModels();
    }
    setSaving(false);
  };

  const handleAdd = async () => {
    setSaving(true);
    const { error } = await supabase.from('models').insert({
      ...newModel,
      supported_resolutions: newModel.supported_resolutions,
      supported_aspect_ratios: newModel.supported_aspect_ratios,
    });

    if (!error) {
      setShowAddForm(false);
      setNewModel(defaultModel);
      fetchModels();
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除此模型吗？')) return;
    
    const { error } = await supabase.from('models').delete().eq('id', id);
    if (!error) {
      fetchModels();
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
        <h1 className="text-2xl font-bold text-slate-800">模型管理</h1>
        <Button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          添加模型
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">添加新模型</h3>
          <div className="grid grid-cols-2 gap-4">
            <input
              placeholder="模型名称 (API)"
              value={newModel.name}
              onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            />
            <input
              placeholder="显示名称"
              value={newModel.display_name}
              onChange={(e) => setNewModel({ ...newModel, display_name: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            />
            <select
              value={newModel.provider}
              onChange={(e) => setNewModel({ ...newModel, provider: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="openai_compat">OpenAI 兼容</option>
              <option value="gemini_official">Gemini 官方</option>
            </select>
            <input
              type="number"
              step="0.0001"
              placeholder="单次调用价格"
              value={newModel.price_per_call}
              onChange={(e) => setNewModel({ ...newModel, price_per_call: parseFloat(e.target.value) })}
              className="px-3 py-2 border rounded-lg"
            />
            <select
              value={newModel.api_method}
              onChange={(e) => setNewModel({ ...newModel, api_method: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="generate">仅生成</option>
              <option value="edit">仅编辑</option>
              <option value="both">生成+编辑</option>
            </select>
            <input
              placeholder="分辨率 (逗号分隔)"
              value={newModel.supported_resolutions.join(', ')}
              onChange={(e) => setNewModel({ ...newModel, supported_resolutions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              className="px-3 py-2 border rounded-lg"
            />
            <input
              placeholder="宽高比 (逗号分隔)"
              value={newModel.supported_aspect_ratios.join(', ')}
              onChange={(e) => setNewModel({ ...newModel, supported_aspect_ratios: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              className="px-3 py-2 border rounded-lg"
            />
            <input
              placeholder="描述"
              value={newModel.description}
              onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleAdd} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '保存'}
            </Button>
            <Button onClick={() => setShowAddForm(false)} className="bg-slate-200 px-4 py-2 rounded-lg">
              取消
            </Button>
          </div>
        </div>
      )}

      {/* Models Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">模型名称</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">显示名称</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">提供商</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">单价</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">调用方式</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">分辨率</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">宽高比</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">状态</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id} className="border-b hover:bg-slate-50">
                {editingId === model.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="px-2 py-1 border rounded w-full text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={editForm.display_name}
                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        className="px-2 py-1 border rounded w-full text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={editForm.provider}
                        onChange={(e) => setEditForm({ ...editForm, provider: e.target.value })}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        <option value="openai_compat">OpenAI 兼容</option>
                        <option value="gemini_official">Gemini 官方</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.0001"
                        value={editForm.price_per_call}
                        onChange={(e) => setEditForm({ ...editForm, price_per_call: parseFloat(e.target.value) })}
                        className="px-2 py-1 border rounded w-20 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={editForm.api_method}
                        onChange={(e) => setEditForm({ ...editForm, api_method: e.target.value })}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        <option value="generate">仅生成</option>
                        <option value="edit">仅编辑</option>
                        <option value="both">生成+编辑</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={editForm.supported_resolutions}
                        onChange={(e) => setEditForm({ ...editForm, supported_resolutions: e.target.value })}
                        className="px-2 py-1 border rounded w-full text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={editForm.supported_aspect_ratios}
                        onChange={(e) => setEditForm({ ...editForm, supported_aspect_ratios: e.target.value })}
                        className="px-2 py-1 border rounded w-full text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={handleSave} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded">
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-slate-600 hover:bg-slate-100 rounded">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-sm font-mono">{model.name}</td>
                    <td className="px-4 py-3 text-sm">{model.display_name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${model.provider === 'gemini_official' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                        {model.provider === 'gemini_official' ? 'Gemini' : 'OpenAI'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">¥{Number(model.price_per_call).toFixed(4)}</td>
                    <td className="px-4 py-3 text-sm">{model.api_method}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{model.supported_resolutions?.join(', ')}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{model.supported_aspect_ratios?.join(', ')}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${model.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {model.is_active ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(model)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(model.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
