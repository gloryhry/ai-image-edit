import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  actionType: 'generate' | 'edit';
  modelId?: string;
  modelName?: string;
  prompt: string;
  aspectRatio?: string;
  size?: string;
  imageBase64?: string;
  imageMimeType?: string;
  maskBase64?: string;
}

interface Settings {
  openai_base_url?: string;
  openai_api_key?: string;
  gemini_base_url?: string;
  gemini_api_key?: string;
}

interface Model {
  id: string;
  name: string;
  display_name: string;
  provider: string;
  price_per_call: number;
  api_method: string;
}

const GEMINI_OFFICIAL_BASE_URL = 'https://generativelanguage.googleapis.com';
const API_TIMEOUT_MS = 300_000;

// Helper: fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Helper: base64 to Blob (Deno compatible)
function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

// Helper: Blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// OpenAI Compatible: Generate Image
async function generateImageOpenAI(
  { prompt, aspectRatio, size, model }: { prompt: string; aspectRatio: string; size: string; model: string },
  settings: Settings
): Promise<{ mimeType: string; base64: string }> {
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
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `生成失败: ${response.status}`);
  }

  const data = await response.json();
  let b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('生成失败：未获取到图片数据');

  if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
  return { mimeType: 'image/png', base64: b64 };
}

// OpenAI Compatible: Edit Image
async function editImageOpenAI(
  {
    imageBase64,
    imageMimeType,
    maskBase64,
    prompt,
    model,
    aspectRatio,
    size,
  }: {
    imageBase64: string;
    imageMimeType: string;
    maskBase64: string;
    prompt: string;
    model: string;
    aspectRatio: string;
    size: string;
  },
  settings: Settings
): Promise<{ mimeType: string; base64: string }> {
  const url = `${settings.openai_base_url || 'https://api.openai.com'}/v1/images/edits`;

  const formData = new FormData();
  formData.append('model', model);
  formData.append('prompt', prompt);
  formData.append('ratio', aspectRatio);
  formData.append('resolution', size);

  const imageBlob = base64ToBlob(imageBase64, imageMimeType);
  const maskBlob = base64ToBlob(maskBase64, 'image/png');

  formData.append('image', imageBlob, 'image.png');
  formData.append('image', maskBlob, 'mask.png');
  formData.append('response_format', 'b64_json');

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.openai_api_key}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `编辑失败: ${response.status}`);
  }

  const data = await response.json();
  let b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('编辑失败：未获取到图片数据');

  if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
  return { mimeType: 'image/png', base64: b64 };
}

// Gemini Official: Build auth
function buildGeminiAuth(apiKey: string, authMode: 'header' | 'query' = 'header') {
  if (authMode === 'query') {
    return { urlSuffix: `?key=${encodeURIComponent(apiKey)}`, headers: {} };
  }
  return { urlSuffix: '', headers: { 'x-goog-api-key': apiKey } };
}

// Extract base64 image from Gemini response
function extractBase64ImageFromGemini(payload: any): { mimeType: string; base64: string } | null {
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
async function generateImageGemini(
  { prompt, model, aspectRatio, size }: { prompt: string; model: string; aspectRatio: string; size: string },
  settings: Settings
): Promise<{ mimeType: string; base64: string }> {
  const baseUrl = settings.gemini_base_url || GEMINI_OFFICIAL_BASE_URL;
  const auth = buildGeminiAuth(settings.gemini_api_key || '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent${auth.urlSuffix}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio, imageSize: size },
    },
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...auth.headers,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `生成失败: ${response.status}`);
  }

  const data = await response.json();
  const extracted = extractBase64ImageFromGemini(data);
  if (!extracted) throw new Error('生成失败：未从 Gemini 响应中解析到图片数据');
  return extracted;
}

// Gemini Official: Edit Image
async function editImageGemini(
  {
    imageBase64,
    imageMimeType,
    maskBase64,
    prompt,
    model,
    aspectRatio,
    size,
  }: {
    imageBase64: string;
    imageMimeType: string;
    maskBase64: string;
    prompt: string;
    model: string;
    aspectRatio: string;
    size: string;
  },
  settings: Settings
): Promise<{ mimeType: string; base64: string }> {
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
    headers: {
      'Content-Type': 'application/json',
      ...auth.headers,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `编辑失败: ${response.status}`);
  }

  const data = await response.json();
  const extracted = extractBase64ImageFromGemini(data);
  if (!extracted) throw new Error('编辑失败：未从 Gemini 响应中解析到图片数据');
  return extracted;
}

// OpenAI Chat Completions style image generation
async function generateImageViaChatCompletions(
  { prompt, model }: { prompt: string; model: string },
  settings: Settings
): Promise<{ mimeType: string; base64: string }> {
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
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `生成失败: ${response.status}`);
  }

  const data = await response.json();
  const extracted = await extractBase64ImageFromChat(data, settings);
  if (!extracted) throw new Error('生成失败：未从响应中解析到图片数据');
  return extracted;
}

// Extract base64 from chat completion response
async function extractBase64ImageFromChat(
  data: any,
  settings: Settings
): Promise<{ mimeType: string; base64: string } | null> {
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
        // Download remote image
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

// Main handler
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Client with user auth (for getting user info)
    const authHeader = req.headers.get('Authorization');
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || '' } },
    });

    // Service client (for reading settings and billing)
    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: '未授权访问' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { actionType, modelId, modelName, prompt, aspectRatio = '1:1', size = '2k' } = body;

    if (!actionType || !prompt) {
      return new Response(JSON.stringify({ error: '缺少必要参数' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get model info
    let model: Model | null = null;
    if (modelId) {
      const { data } = await supabaseService.from('models').select('*').eq('id', modelId).single();
      model = data;
    } else if (modelName) {
      const { data } = await supabaseService.from('models').select('*').eq('name', modelName).single();
      model = data;
    }

    if (!model) {
      return new Response(JSON.stringify({ error: '未找到模型配置' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get API settings (only service role can read these)
    const { data: settingsData } = await supabaseService
      .from('system_settings')
      .select('key, value')
      .in('key', ['openai_base_url', 'openai_api_key', 'gemini_base_url', 'gemini_api_key']);

    const settings: Settings = {};
    settingsData?.forEach((s: { key: string; value: string }) => {
      settings[s.key as keyof Settings] = s.value;
    });

    // Check user balance before calling API
    const { data: profile } = await supabaseService.from('profiles').select('balance').eq('id', user.id).single();

    if (!profile || profile.balance < model.price_per_call) {
      return new Response(JSON.stringify({ error: '余额不足' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call AI API
    let result: { mimeType: string; base64: string };
    let isSuccess = false;
    let errorMessage: string | null = null;

    try {
      const isChatImageModel = model.name === 'gemini-3-pro-image-preview' || model.name === 'gemini-2.5-flash-image';

      if (actionType === 'generate') {
        if (model.provider === 'gemini_official') {
          result = await generateImageGemini(
            { prompt, model: model.name, aspectRatio, size },
            settings
          );
        } else if (isChatImageModel) {
          result = await generateImageViaChatCompletions({ prompt, model: model.name }, settings);
        } else {
          result = await generateImageOpenAI(
            { prompt, aspectRatio, size, model: model.name },
            settings
          );
        }
      } else if (actionType === 'edit') {
        const { imageBase64, imageMimeType = 'image/png', maskBase64 } = body;

        if (!imageBase64 || !maskBase64) {
          return new Response(JSON.stringify({ error: '编辑操作需要提供图片和遮罩' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (model.provider === 'gemini_official') {
          result = await editImageGemini(
            { imageBase64, imageMimeType, maskBase64, prompt, model: model.name, aspectRatio, size },
            settings
          );
        } else {
          result = await editImageOpenAI(
            { imageBase64, imageMimeType, maskBase64, prompt, model: model.name, aspectRatio, size },
            settings
          );
        }
      } else {
        return new Response(JSON.stringify({ error: '不支持的操作类型' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      isSuccess = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
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
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null,
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

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器错误';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
