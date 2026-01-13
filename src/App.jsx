import React, { useRef, useState, useEffect } from 'react';
import { Download, Image as ImageIcon, ImageOff, Upload } from 'lucide-react';
import { CanvasEditor } from './components/CanvasEditor';
import { ControlPanel } from './components/ControlPanel';
import { Layout } from './components/Layout';
import { Button } from './components/ui/Button';
import {
  editImage,
  editImageViaChatCompletions,
  editImageViaGeminiOfficial,
  generateImage,
  generateImageViaChatCompletions,
  generateImageViaGeminiOfficial,
  uploadFile,
} from './lib/api';
import { supabase } from './lib/supabase';
import { useAuth } from './contexts/AuthContext';
import { handleBilling } from './lib/billing';

function App() {
  const { user, profile, refreshProfile } = useAuth();

  const [imageUrl, setImageUrl] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/png');
  const [imageRemoteUrl, setImageRemoteUrl] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // API 配置从 Supabase 获取
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiBaseUrl, setGeminiBaseUrl] = useState('');

  // 模型列表从 Supabase 获取
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('selectedModelId') || '');

  // 从 Supabase 加载系统设置和模型列表
  useEffect(() => {
    const fetchData = async () => {
      // 加载系统设置
      const { data: settingsData, error: settingsError } = await supabase.from('system_settings').select('*');
      if (!settingsError && settingsData) {
        const settingsMap = {};
        settingsData.forEach((s) => {
          settingsMap[s.key] = s.value;
        });
        if (settingsMap.openai_api_key) setApiKey(settingsMap.openai_api_key);
        if (settingsMap.openai_base_url) setBaseUrl(settingsMap.openai_base_url);
        if (settingsMap.gemini_api_key) setGeminiApiKey(settingsMap.gemini_api_key);
        if (settingsMap.gemini_base_url) setGeminiBaseUrl(settingsMap.gemini_base_url);
      }

      // 加载模型列表
      const { data: modelsData, error: modelsError } = await supabase
        .from('models')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (!modelsError && modelsData) {
        setModels(modelsData);
        // 如果没有选中的模型或选中的模型不存在，选择第一个
        const savedId = localStorage.getItem('selectedModelId');
        const modelExists = modelsData.some(m => m.id === savedId);
        if (!modelExists && modelsData.length > 0) {
          setSelectedModelId(modelsData[0].id);
        }
      }
    };
    fetchData();
  }, []);

  // 获取当前选中的模型信息
  const selectedModel = models.find(m => m.id === selectedModelId) || null;
  const apiProvider = selectedModel?.provider || 'openai_compat';
  const modelName = selectedModel?.name || '';

  const [mode, setMode] = useState('generate'); // 'generate' | 'edit'
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState('brush'); // 'brush' | 'rectangle' | 'eraser' | 'select'
  const [brushSize, setBrushSize] = useState(30);

  const [imageSize, setImageSize] = useState(() => localStorage.getItem('imageSize') || '2k');
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('aspectRatio') || '1:1');

  const canvasRef = useRef(null);

  // 定义支持的宽高比选项及其数值
  const aspectRatioOptions = [
    { value: '1:1', ratio: 1 },
    { value: '16:9', ratio: 16 / 9 },
    { value: '9:16', ratio: 9 / 16 },
    { value: '4:3', ratio: 4 / 3 },
    { value: '3:4', ratio: 3 / 4 },
    { value: '21:9', ratio: 21 / 9 },
  ];

  // 根据图片宽高检测最接近的宽高比选项
  const detectAspectRatio = (width, height) => {
    const imageRatio = width / height;
    let closestOption = aspectRatioOptions[0];
    let minDiff = Math.abs(imageRatio - closestOption.ratio);

    for (const option of aspectRatioOptions) {
      const diff = Math.abs(imageRatio - option.ratio);
      if (diff < minDiff) {
        minDiff = diff;
        closestOption = option;
      }
    }

    return closestOption.value;
  };
  const [regions, setRegions] = useState([]);
  const [regionInstructions, setRegionInstructions] = useState({});

  const resetCurrentImage = () => {
    setImageUrl(null);
    setImageBase64(null);
    setImageMimeType('image/png');
    setImageRemoteUrl(null);
    setMode('generate');
    setIsDrawing(false);
    setDrawMode('brush');
    setRegions([]);
    setRegionInstructions({});
    canvasRef.current = null;
  };

  const isChatImageModel = (name) =>
    name === 'gemini-3-pro-image-preview' || name === 'gemini-2.5-flash-image';

  const ensureCurrentImageRemoteUrl = async () => {
    if (imageRemoteUrl) return imageRemoteUrl;
    if (!imageBase64) return null;

    const dataUrl = `data:${imageMimeType};base64,${imageBase64}`;
    const uploaded = await uploadFile({
      dataUrl,
      apiKey,
      baseUrl,
      apiProvider,
      geminiApiKey,
      filename: 'image.png',
    });
    setImageRemoteUrl(uploaded.url);
    return uploaded.url;
  };

  React.useEffect(() => {
    localStorage.setItem('selectedModelId', selectedModelId);
  }, [selectedModelId]);

  React.useEffect(() => {
    localStorage.setItem('imageSize', imageSize);
  }, [imageSize]);

  React.useEffect(() => {
    localStorage.setItem('aspectRatio', aspectRatio);
  }, [aspectRatio]);

  const handleFileUpload = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      // 允许重复选择同一个文件也能触发 onChange
      input.value = '';
      // 避免异步加载竞态导致“新图不替换”
      resetCurrentImage();

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
      });
      const mime = String(dataUrl).split(';')[0].split(':')[1] || 'image/png';
      const base64 = String(dataUrl).split(',')[1];
      setImageMimeType(mime);
      setImageBase64(base64);
      setImageUrl(String(dataUrl));
      setImageRemoteUrl(null);
      setMode('edit');
      setDrawMode('brush');
      setIsDrawing(true);

      // 检测图片宽高比并自动选择最接近的选项
      const img = new window.Image();
      img.onload = () => {
        const detectedRatio = detectAspectRatio(img.width, img.height);
        setAspectRatio(detectedRatio);
      };
      img.src = String(dataUrl);
    } catch (err) {
      console.error('上传失败', err);
    }
  };

  const downloadCurrentImage = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    const ext = imageMimeType === 'image/jpeg' ? 'jpg' : imageMimeType === 'image/webp' ? 'webp' : 'png';
    a.download = `图片_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const buildMaskBase64 = () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('画布未就绪');
    const bgImage = canvas.backgroundImage;
    if (!bgImage) throw new Error('未找到背景图片');

    const objects = canvas.getObjects();

    const originalBg = canvas.backgroundImage;
    const originalBgColor = canvas.backgroundColor;
    const originalStyles = objects.map((obj) => ({
      obj,
      fill: obj.fill,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      opacity: obj.opacity,
    }));

    try {
      canvas.discardActiveObject();
      canvas.backgroundImage = null;
      canvas.backgroundColor = 'black';
      objects.forEach((obj) => {
        if (obj.type === 'path' || obj.type === 'Path') {
          obj.set({ stroke: 'white', opacity: 1 });
        } else if (obj.type === 'rect') {
          obj.set({ fill: 'white', stroke: 'white', opacity: 1 });
        }
      });

      // 这里需要同步渲染，确保导出的 mask 与当前画面完全一致
      canvas.renderAll();

      // 不受视图缩放/平移影响：临时重置 viewportTransform，再按原图尺寸导出
      const originalVpt = canvas.viewportTransform;
      try {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        const maskDataUrl = canvas.toDataURL({
          format: 'png',
          left: 0,
          top: 0,
          width: bgImage.width,
          height: bgImage.height,
          multiplier: 1,
          enableRetinaScaling: false,
        });
        return maskDataUrl.split(',')[1];
      } finally {
        canvas.setViewportTransform(originalVpt);
      }
    } finally {
      canvas.backgroundImage = originalBg;
      canvas.backgroundColor = originalBgColor;
      originalStyles.forEach(({ obj, fill, stroke, strokeWidth, opacity }) => {
        obj.set({ fill, stroke, strokeWidth, opacity });
      });
      canvas.requestRenderAll();
    }
  };

  const clearMaskObjects = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getObjects().slice().forEach(obj => canvas.remove(obj));
    canvas.requestRenderAll();
  };

  const handleGenerate = async () => {
    if (!selectedModel) {
      alert('请先选择一个模型');
      return;
    }

    if (!user) {
      alert('请先登录');
      return;
    }

    if (apiProvider === 'gemini_official') {
      if (!geminiApiKey) {
        alert('请先在后台设置 Gemini API Key');
        return;
      }
    } else {
      if (!apiKey) {
        alert('请先在后台设置 API Key');
        return;
      }
    }

    const actionType = mode === 'generate' ? 'generate' : 'edit';
    const pricePerCall = selectedModel?.price_per_call || 0;

    const requestParams = {
      prompt,
      model: modelName,
      aspectRatio,
      imageSize,
    };

    setIsGenerating(true);
    let isSuccess = false;
    let errorMessage = null;

    try {
      if (mode === 'generate') {
        if (apiProvider === 'gemini_official') {
          const { mimeType, base64 } = await generateImageViaGeminiOfficial({
            prompt,
            apiKey: geminiApiKey,
            baseUrl: geminiBaseUrl,
            model: modelName,
            aspectRatio,
            imageSize,
          });
          setImageMimeType(mimeType || 'image/png');
          setImageBase64(base64);
          setImageUrl(`data:${mimeType || 'image/png'};base64,${base64}`);
          setImageRemoteUrl(null);
          setMode('edit');
          setDrawMode('brush');
          setIsDrawing(true);
          isSuccess = true;
        } else if (isChatImageModel(modelName)) {
          const { mimeType, base64 } = await generateImageViaChatCompletions({
            prompt,
            apiKey,
            baseUrl,
            model: modelName,
          });
          setImageMimeType(mimeType || 'image/png');
          setImageBase64(base64);
          setImageUrl(`data:${mimeType || 'image/png'};base64,${base64}`);
          setImageRemoteUrl(null);
          setMode('edit');
          setDrawMode('brush');
          setIsDrawing(true);
          isSuccess = true;
        } else {
          const result = await generateImage({
            prompt,
            apiKey,
            baseUrl,
            model: modelName,
            size: imageSize,
            aspectRatio: aspectRatio,
          });

          let b64 = result.data?.[0]?.b64_json;
          if (b64) {
            if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
            setImageMimeType('image/png');
            setImageBase64(b64);
            setImageUrl(`data:image/png;base64,${b64}`);
            setImageRemoteUrl(null);
            setMode('edit');
            setDrawMode('brush');
            setIsDrawing(true);
            isSuccess = true;
          }
        }
      } else {
        if (!imageBase64) {
          console.error('缺少图片数据');
          return;
        }

        const maskBase64 = buildMaskBase64();

        let resultImage = null;
        if (apiProvider === 'gemini_official') {
          const { mimeType, base64 } = await editImageViaGeminiOfficial({
            imageBase64,
            imageMimeType,
            maskBase64,
            prompt,
            apiKey: geminiApiKey,
            baseUrl: geminiBaseUrl,
            model: modelName,
            aspectRatio,
            imageSize,
          });
          setImageMimeType(mimeType || 'image/png');
          setImageBase64(base64);
          setImageUrl(`data:${mimeType || 'image/png'};base64,${base64}`);
          setImageRemoteUrl(null);
          clearMaskObjects();
          isSuccess = true;
        } else if (isChatImageModel(modelName)) {
          const imageUrlForModel = await ensureCurrentImageRemoteUrl();
          if (!imageUrlForModel) throw new Error('缺少图片数据');
          const maskDataUrl = `data:image/png;base64,${maskBase64}`;
          const { mimeType, base64 } = await editImageViaChatCompletions({
            imageDataUrl: imageUrlForModel,
            maskDataUrl,
            prompt,
            apiKey,
            baseUrl,
            model: modelName,
          });
          setImageMimeType(mimeType || 'image/png');
          setImageBase64(base64);
          setImageUrl(`data:${mimeType || 'image/png'};base64,${base64}`);
          setImageRemoteUrl(null);
          clearMaskObjects();
          isSuccess = true;
        } else {
          resultImage = await editImage({
            imageBase64,
            maskBase64,
            prompt,
            apiKey,
            baseUrl,
            model: modelName,
            imageMimeType,
            ratio: aspectRatio,
            resolution: imageSize,
          });
        }

        if (resultImage) {
          let b64 = resultImage;
          if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
          setImageMimeType('image/png');
          setImageBase64(b64);
          setImageUrl(`data:image/png;base64,${b64}`);
          setImageRemoteUrl(null);
          clearMaskObjects();
          isSuccess = true;
        }
      }
    } catch (err) {
      console.error(err);
      errorMessage = err.message;
      alert(`出错：${err.message}`);
    } finally {
      await handleBilling({
        userId: user.id,
        modelName,
        actionType,
        pricePerCall,
        isSuccess,
        errorMessage,
        requestParams,
      });

      if (isSuccess) {
        refreshProfile();
      }

      setIsGenerating(false);
    }
  };

  return (
    <Layout
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="relative group">
            <Button variant="ghost" size="icon" className="rounded-full w-12 h-12 bg-white shadow-sm">
              <Upload size={20} />
            </Button>
            <input
              type="file"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleFileUpload}
              accept="image/*"
            />
          </div>

          {imageUrl && (
            <>
              <div className="w-8 h-px bg-gray-300" />
              <Button
                variant={isDrawing ? 'primary' : 'ghost'}
                size="icon"
                className="rounded-full w-12 h-12"
                onClick={() => setIsDrawing(!isDrawing)}
                title="启用/暂停绘制"
              >
                <ImageIcon size={20} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full w-12 h-12"
                onClick={downloadCurrentImage}
                title="下载当前图片"
              >
                <Download size={20} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full w-12 h-12 text-red-500 hover:bg-red-50"
                onClick={resetCurrentImage}
                title="移除当前图片（重置）"
              >
                <ImageOff size={20} />
              </Button>
            </>
          )}
        </div>
      }
      properties={
        <ControlPanel
          prompt={prompt}
          setPrompt={setPrompt}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          models={models}
          selectedModelId={selectedModelId}
          setSelectedModelId={setSelectedModelId}
          selectedModel={selectedModel}
          mode={mode}
          setMode={setMode}
          imageSize={imageSize}
          setImageSize={setImageSize}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          regions={regions}
          regionInstructions={regionInstructions}
          setRegionInstruction={(id, text) =>
            setRegionInstructions((prev) => ({ ...prev, [id]: text }))
          }
          focusRegion={(id) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getObjects().find((o) => o.type === 'rect' && o.regionId === id);
            if (!rect) return;
            setDrawMode('select');
            setIsDrawing(false);
            canvas.setActiveObject(rect);
            canvas.requestRenderAll();
          }}
        />
      }
    >
      <div className="flex-1 w-full h-full p-4">
        {imageUrl ? (
          <CanvasEditor
            imageUrl={imageUrl}
            isDrawing={isDrawing}
            setIsDrawing={setIsDrawing}
            drawMode={drawMode}
            setDrawMode={setDrawMode}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            onRegionsChange={(next) => {
              setRegions(next);
              setRegionInstructions((prev) => {
                const keep = new Set(next.map((r) => r.id));
                const nextMap = {};
                Object.keys(prev).forEach((k) => {
                  const id = Number(k);
                  if (keep.has(id)) nextMap[id] = prev[id];
                });
                return nextMap;
              });
            }}
            onCanvasReady={(canvas) => {
              canvasRef.current = canvas;
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-ios-lg">
            <ImageIcon size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无图片</p>
            <p className="text-sm">上传图片或先生成一张图片开始编辑</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default App;
