import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GEMINI_OFFICIAL_BASE_URL = 'https://generativelanguage.googleapis.com';
const API_TIMEOUT_MS = 300_000;

// Helper: fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readApiErrorMessage(response) {
  const text = await response.text().catch(() => '');
  try {
    const json = JSON.parse(text || '{}');
    if (typeof json?.error?.message === 'string') return json.error.message;
    if (typeof json?.message === 'string') return json.message;
    if (typeof json?.error === 'string') return json.error;
    return text || null;
  } catch {
    return text || null;
  }
}

// Helper: base64 to Blob
function base64ToBlob(base64, mimeType = 'image/png') {
  const bytes = Buffer.from(base64, 'base64');
  return new Blob([bytes], { type: mimeType });
}

// Helper: Blob to base64
async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

// OpenAI Compatible: Generate Image
async function generateImageOpenAI({ prompt, aspectRatio, size, model }, settings) {
  const url = `${settings.openai_base_url || 'https://api.openai.com'}/v1/images/generations`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openai_api_key}`,
    },
    body: JSON.stringify({
      prompt,
      model,
      n: 1,
      ratio: aspectRatio,
      resolution: size,
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const message = await readApiErrorMessage(response);
    throw new Error(`${message || '生成失败'} (status: ${response.status})`);
  }

  const data = await response.json();
  let b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('生成失败：未获取到图片数据');

  if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
  return { mimeType: 'image/png', base64: b64 };
}

// OpenAI Compatible: Edit Image
async function editImageOpenAI({ imageBase64, imageMimeType, maskBase64, prompt, model, aspectRatio, size }, settings) {
  const url = `${settings.openai_base_url || 'https://api.openai.com'}/v1/images/edits`;

  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', prompt);
  formData.append('ratio', aspectRatio);
  formData.append('resolution', size);

  const imageBlob = base64ToBlob(imageBase64, imageMimeType);
  const maskBlob = base64ToBlob(maskBase64, 'image/png');

  formData.append('image', imageBlob, 'image.png');
  formData.append('mask', maskBlob, 'mask.png');
  formData.append('response_format', 'b64_json');

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.openai_api_key}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const message = await readApiErrorMessage(response);
    throw new Error(`${message || '编辑失败'} (status: ${response.status})`);
  }

  const data = await response.json();
  let b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('编辑失败：未获取到图片数据');

  if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
  return { mimeType: 'image/png', base64: b64 };
}

// Gemini Official: Build auth
function buildGeminiAuth(apiKey, authMode = 'header') {
  if (authMode === 'query') {
    return { urlSuffix: `?key=${encodeURIComponent(apiKey)}`, headers: {} };
  }
  return { urlSuffix: '', headers: { 'x-goog-api-key': apiKey } };
}

// Extract base64 image from Gemini response
function extractBase64ImageFromGemini(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    const inlineData = part?.inline_data || part?.inlineData;
    if (inlineData) {
      const base64 = inlineData.data;
      const mimeType = inlineData.mime_type || inlineData.mimeType || 'image/png';
      if (base64 && typeof base64 === 'string') {
        return { base64, mimeType };
      }
    }
  }
  return null;
}

// Gemini Official: Generate Image
async function generateImageGemini({ prompt, model, aspectRatio, size }, settings) {
  const baseUrl = settings.gemini_base_url || GEMINI_OFFICIAL_BASE_URL;
  const auth = buildGeminiAuth(settings.gemini_api_key || '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent${auth.urlSuffix}`;

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio, imageSize: size },
    },
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth.headers },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const message = await readApiErrorMessage(response);
    throw new Error(`${message || '生成失败'} (status: ${response.status})`);
  }

  const data = await response.json();
  const extracted = extractBase64ImageFromGemini(data);
  if (!extracted) throw new Error('生成失败：未从 Gemini 响应中解析到图片数据');
  return extracted;
}

// Gemini Official: Edit Image
async function editImageGemini({ imageBase64, imageMimeType, maskBase64, prompt, model, aspectRatio, size }, settings) {
  const baseUrl = settings.gemini_base_url || GEMINI_OFFICIAL_BASE_URL;
  const auth = buildGeminiAuth(settings.gemini_api_key || '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent${auth.urlSuffix}`;

  const instruction =
    `你将收到两张图片：第一张为原图，第二张为遮罩。\n` +
    `编辑规则（必须严格遵守）：\n` +
    `1) 只允许修改遮罩中【白色】区域的内容；遮罩中【黑色】区域必须与原图保持完全一致（像素级不变）。\n` +
    `2) 不要改动黑色区域的任何内容：包括但不限于构图、背景、人物/物体位置、轮廓、大小、颜色、光照、阴影、清晰度、对比度、风格、文字水印等。\n` +
    `3) 白色区域的边缘要自然融合，避免溢出到黑色区域；不要产生新的改动区域或额外元素。\n` +
    `4) 如果指令与"仅修改白色区域/黑色区域完全不变"冲突，优先保证黑色区域不变。\n` +
    `编辑要求：\n${prompt}\n` +
    `仅输出一张编辑后的图片，不要输出任何解释文字。`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: instruction },
          { inline_data: { mime_type: imageMimeType, data: imageBase64 } },
          { inline_data: { mime_type: 'image/png', data: maskBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio, imageSize: size },
    },
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth.headers },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const message = await readApiErrorMessage(response);
    throw new Error(`${message || '编辑失败'} (status: ${response.status})`);
  }

  const data = await response.json();
  const extracted = extractBase64ImageFromGemini(data);
  if (!extracted) throw new Error('编辑失败：未从 Gemini 响应中解析到图片数据');
  return extracted;
}

// OpenAI Chat Completions style image generation
async function generateImageViaChatCompletions({ prompt, model }, settings) {
  const url = `${settings.openai_base_url || 'https://api.openai.com'}/v1/chat/completions`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openai_api_key}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const message = await readApiErrorMessage(response);
    throw new Error(`${message || '生成失败'} (status: ${response.status})`);
  }

  const data = await response.json();
  const extracted = await extractBase64ImageFromChat(data);
  if (!extracted) throw new Error('生成失败：未从响应中解析到图片数据');
  return extracted;
}

// Extract base64 from chat completion response
async function extractBase64ImageFromChat(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'image_url' && part?.image_url?.url) {
        const imgUrl = part.image_url.url;
        if (imgUrl.startsWith('data:image')) {
          const [meta, b64] = imgUrl.split(',');
          const mimeType = meta.split(';')[0].slice('data:'.length) || 'image/png';
          return { mimeType, base64: b64 };
        }
        const resp = await fetchWithTimeout(imgUrl, { method: 'GET' });
        if (resp.ok) {
          const blob = await resp.blob();
          const base64 = await blobToBase64(blob);
          return { mimeType: blob.type || 'image/png', base64 };
        }
      }
    }
  }

  if (typeof content === 'string') {
    const imgMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (imgMatch) {
      const imgUrl = imgMatch[1];
      const resp = await fetchWithTimeout(imgUrl, { method: 'GET' });
      if (resp.ok) {
        const blob = await resp.blob();
        const base64 = await blobToBase64(blob);
        return { mimeType: blob.type || 'image/png', base64 };
      }
    }
  }

  return null;
}

// Main API endpoint
app.post('/api/ai-image', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    // Create Supabase clients
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader || '' } },
    });
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: '未授权访问' });
    }

    // Parse request body
    const { actionType, modelId, modelName, prompt, aspectRatio = '1:1', size = '2k', imageBase64, imageMimeType = 'image/png', maskBase64 } = req.body;

    if (!actionType || !prompt) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // Get model info
    let model = null;
    if (modelId) {
      const { data } = await supabaseService.from('models').select('*').eq('id', modelId).single();
      model = data;
    } else if (modelName) {
      const { data } = await supabaseService.from('models').select('*').eq('name', modelName).single();
      model = data;
    }

    if (!model) {
      return res.status(400).json({ error: '未找到模型配置' });
    }

    // Get API settings
    const { data: settingsData } = await supabaseService
      .from('system_settings')
      .select('key, value')
      .in('key', ['openai_base_url', 'openai_api_key', 'gemini_base_url', 'gemini_api_key']);

    const settings = {};
    settingsData?.forEach((s) => {
      settings[s.key] = s.value;
    });

    // Check user balance
    const { data: profile } = await supabaseService.from('profiles').select('balance').eq('id', user.id).single();

    if (!profile || profile.balance < model.price_per_call) {
      return res.status(402).json({ error: '余额不足' });
    }

    // Call AI API
    let result;
    let isSuccess = false;
    let errorMessage = null;

    try {
      const isChatImageModel = model.name === 'gemini-3-pro-image-preview' || model.name === 'gemini-2.5-flash-image';

      if (actionType === 'generate') {
        if (model.provider === 'gemini_official') {
          result = await generateImageGemini({ prompt, model: model.name, aspectRatio, size }, settings);
        } else if (isChatImageModel) {
          result = await generateImageViaChatCompletions({ prompt, model: model.name }, settings);
        } else {
          result = await generateImageOpenAI({ prompt, aspectRatio, size, model: model.name }, settings);
        }
      } else if (actionType === 'edit') {
        if (!imageBase64 || !maskBase64) {
          return res.status(400).json({ error: '编辑操作需要提供图片和遮罩' });
        }

        if (model.provider === 'gemini_official') {
          result = await editImageGemini({ imageBase64, imageMimeType, maskBase64, prompt, model: model.name, aspectRatio, size }, settings);
        } else {
          result = await editImageOpenAI({ imageBase64, imageMimeType, maskBase64, prompt, model: model.name, aspectRatio, size }, settings);
        }
      } else {
        return res.status(400).json({ error: '不支持的操作类型' });
      }

      isSuccess = true;
    } catch (err) {
      errorMessage = err.message;
      throw err;
    } finally {
      // Log usage
      await supabaseService.from('usage_logs').insert({
        user_id: user.id,
        model_name: model.name,
        action_type: actionType,
        cost: isSuccess ? model.price_per_call : 0,
        is_success: isSuccess,
        error_message: errorMessage,
        request_params: { prompt, aspectRatio, size, provider: model.provider },
        ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      });

      // Deduct balance if successful
      if (isSuccess && model.price_per_call > 0) {
        const { data: deductResult, error: deductError } = await supabaseService.rpc('deduct_balance', {
          p_user_id: user.id,
          p_amount: model.price_per_call,
          p_model_name: model.name,
          p_action_type: actionType,
        });
        if (deductError) {
          console.error('Deduct balance error:', deductError);
        } else if (deductResult && !deductResult.success) {
          console.error('Deduct balance failed:', deductResult.message);
        }
      }
    }

    res.json(result);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message || '服务器错误' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API Server running on port ${PORT}`);
});
