import React from 'react';
import { Button } from './ui/Button';
import { Sparkles, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import galaxyIcon from '../assets/galaxy.png';

export function ControlPanel({
    prompt,
    setPrompt,
    onGenerate,
    isGenerating,
    models = [],
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    mode,
    setMode,
    imageSize,
    setImageSize,
    aspectRatio,
    setAspectRatio,
    regions = [],
    regionInstructions = {},
    setRegionInstruction,
    focusRegion,
}) {
    const [copyHint, setCopyHint] = React.useState('');

    // 根据当前模式过滤可用模型
    const availableModels = React.useMemo(() => {
        return models.filter(m => {
            if (mode === 'generate') {
                return m.api_method === 'generate' || m.api_method === 'both';
            } else {
                return m.api_method === 'edit' || m.api_method === 'both';
            }
        });
    }, [models, mode]);

    // 当模式改变时，如果当前选中的模型不支持该模式，则自动切换
    React.useEffect(() => {
        if (availableModels.length > 0 && selectedModelId) {
            const isCurrentModelAvailable = availableModels.some(m => m.id === selectedModelId);
            if (!isCurrentModelAvailable) {
                setSelectedModelId(availableModels[0].id);
            }
        }
    }, [mode, availableModels, selectedModelId, setSelectedModelId]);

    // 获取当前模型支持的分辨率和宽高比
    const supportedResolutions = selectedModel?.supported_resolutions || ['1024x1024'];
    const supportedAspectRatios = selectedModel?.supported_aspect_ratios || ['1:1'];

    // 当模型改变时，如果当前选择的分辨率/宽高比不在支持列表中，则自动切换
    React.useEffect(() => {
        if (supportedResolutions.length > 0 && !supportedResolutions.includes(imageSize)) {
            setImageSize(supportedResolutions[0]);
        }
    }, [selectedModelId, supportedResolutions, imageSize, setImageSize]);

    React.useEffect(() => {
        if (supportedAspectRatios.length > 0 && !supportedAspectRatios.includes(aspectRatio)) {
            setAspectRatio(supportedAspectRatios[0]);
        }
    }, [selectedModelId, supportedAspectRatios, aspectRatio, setAspectRatio]);

    const copyToClipboard = async (text) => {
        if (!text) return false;
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            try {
                const el = document.createElement('textarea');
                el.value = text;
                el.style.position = 'fixed';
                el.style.left = '-9999px';
                document.body.appendChild(el);
                el.focus();
                el.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(el);
                return ok;
            } catch {
                return false;
            }
        }
    };

    const composeRegionsPrompt = () => {
        if (!regions || regions.length === 0) return '';
        const lines = [];
        lines.push('请按以下区域分别进行编辑（坐标为原图像素，格式：#编号[x,y,w,h]）：');
        regions.forEach((r) => {
            const instr = (regionInstructions?.[r.id] || '').trim();
            lines.push(
                `#${r.id}[${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}]：${instr || '（在右侧为该区域填写要修改的内容）'}`
            );
        });
        return lines.join('\n');
    };

    // 宽高比显示标签
    const aspectRatioLabels = {
        '1:1': '1:1（方形）',
        '16:9': '16:9（横向）',
        '9:16': '9:16（竖向）',
        '4:3': '4:3',
        '3:4': '3:4',
        '21:9': '21:9',
    };

    return (
        <div className="flex flex-col h-full gap-6 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <img src={galaxyIcon} className="w-8 h-8 animate-pulse" alt="Galaxy" />
                    <h2 className="text-xl font-bold tracking-tight text-slate-900">银河杂货铺 · 绘图站</h2>
                </div>
            </div>

            {/* 模型选择 - 常驻显示 */}
            <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">选择模型</label>
                <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full px-3 py-2 bg-white/80 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                    {availableModels.length === 0 ? (
                        <option value="">暂无可用模型</option>
                    ) : (
                        availableModels.map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.display_name || model.name}
                            </option>
                        ))
                    )}
                </select>
                {selectedModel && (
                    <div className="text-xs text-slate-500">
                        {selectedModel.provider === 'gemini_official' ? (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">Gemini</span>
                        ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">OpenAI 兼容</span>
                        )}
                        {selectedModel.description && (
                            <span className="ml-2">{selectedModel.description}</span>
                        )}
                    </div>
                )}
            </div>

            {/* 生成/编辑模式切换 */}
            <div className="space-y-4">
                <div className="flex p-1 bg-gray-200/50 rounded-xl">
                    <button
                        onClick={() => setMode('generate')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                            mode === 'generate' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        生成
                    </button>
                    <button
                        onClick={() => setMode('edit')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                            mode === 'edit' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        编辑
                    </button>
                </div>

                {/* 图片尺寸 */}
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">图片尺寸</label>
                    <select
                        value={imageSize}
                        onChange={(e) => setImageSize(e.target.value)}
                        disabled={supportedResolutions.length <= 1}
                        className={cn(
                            "w-full px-3 py-2 bg-white/80 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400",
                            supportedResolutions.length <= 1 && "cursor-not-allowed opacity-70"
                        )}
                    >
                        {supportedResolutions.map((res) => (
                            <option key={res} value={res}>{res}</option>
                        ))}
                    </select>
                </div>

                {/* 宽高比 */}
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">宽高比</label>
                    <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                        disabled={supportedAspectRatios.length <= 1}
                        className={cn(
                            "w-full px-3 py-2 bg-white/80 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400",
                            supportedAspectRatios.length <= 1 && "cursor-not-allowed opacity-70"
                        )}
                    >
                        {supportedAspectRatios.map((ratio) => (
                            <option key={ratio} value={ratio}>
                                {aspectRatioLabels[ratio] || ratio}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 提示词 */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {mode === 'generate' ? '提示词' : '编辑指令'}
                        </label>
                        <span className={cn(
                            "text-xs",
                            prompt.length > 400 ? "text-orange-500" : "text-slate-400",
                            prompt.length >= 800 && "text-red-500"
                        )}>
                            {prompt.length}/800
                        </span>
                    </div>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        maxLength={800}
                        className="w-full h-32 px-4 py-3 bg-white/60 backdrop-blur-sm rounded-ios-md border border-white/60 shadow-inner-cut resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 text-slate-800 placeholder:text-slate-400"
                        placeholder={mode === 'generate' ? "描述你想生成的图片（风格、光影、主体、细节）…" : "先框选/涂抹需要修改的区域，再描述如何修改…"}
                    />
                </div>

                <Button
                    onClick={onGenerate}
                    disabled={isGenerating || !prompt || !selectedModelId}
                    className="w-full h-14 text-lg shadow-soft-spread"
                >
                    {isGenerating ? (
                        <span className="flex items-center gap-2">
                            <Sparkles className="animate-spin" /> 处理中…
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <Sparkles /> {mode === 'generate' ? '生成图片' : '应用编辑'}
                        </span>
                    )}
                </Button>
            </div>

            {mode === 'edit' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">矩形区域</h3>
                        {copyHint && <span className="text-xs text-slate-500">{copyHint}</span>}
                    </div>

                    {regions.length === 0 ? (
                        <div className="p-3 bg-white/50 rounded-ios-md border border-white/60 text-xs text-slate-600">
                            还没有矩形框选。请选择底部"矩形框选"工具，在图片上拖拽创建多个区域。
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {regions.map((r) => (
                                <div
                                    key={r.id}
                                    className="p-3 bg-white/50 rounded-ios-md border border-white/60 shadow-sm"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-semibold text-slate-900">区域 #{r.id}</div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => focusRegion?.(r.id)}
                                            title="在画布中选中该区域"
                                        >
                                            定位
                                        </Button>
                                    </div>
                                    <div className="mt-1 text-xs text-slate-600">
                                        x={Math.round(r.x)}，y={Math.round(r.y)}，w={Math.round(r.width)}，h={Math.round(r.height)}
                                    </div>
                                    <div className="mt-2 space-y-1">
                                        <textarea
                                            value={regionInstructions?.[r.id] || ''}
                                            onChange={(e) => setRegionInstruction?.(r.id, e.target.value)}
                                            maxLength={800}
                                            className="w-full h-16 px-3 py-2 bg-white/70 rounded-ios-md border border-white/60 shadow-inner-cut resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 text-slate-800 placeholder:text-slate-400 text-sm"
                                            placeholder="填写该区域要修改成什么，例如：把衣服变成黑色皮夹克…"
                                        />
                                        <div className="text-right">
                                            <span className={cn(
                                                "text-xs",
                                                (regionInstructions?.[r.id] || '').length > 400 ? "text-orange-500" : "text-slate-400",
                                                (regionInstructions?.[r.id] || '').length >= 800 && "text-red-500"
                                            )}>
                                                {(regionInstructions?.[r.id] || '').length}/800
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => {
                                        setPrompt(composeRegionsPrompt());
                                        setCopyHint('已写入到提示词');
                                        setTimeout(() => setCopyHint(''), 1500);
                                    }}
                                >
                                    写入到提示词
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={async () => {
                                        const ok = await copyToClipboard(composeRegionsPrompt());
                                        setCopyHint(ok ? '已复制' : '复制失败');
                                        setTimeout(() => setCopyHint(''), 1500);
                                    }}
                                >
                                    复制模板
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="mt-auto">
                <div className="p-4 bg-blue-50/50 rounded-ios-md border border-blue-100/50">
                    <h4 className="text-sm font-semibold text-blue-900 mb-1">提示</h4>
                    <p className="text-xs text-blue-700/80 leading-relaxed">
                        {mode === 'generate'
                            ? "建议描述：主体、风格、光线、构图、材质、氛围，可获得更稳定效果。"
                            : "先用画笔/矩形选中要修改的区域，再用编辑指令描述需要变更的内容。"}
                    </p>
                </div>
            </div>
        </div>
    );
}
