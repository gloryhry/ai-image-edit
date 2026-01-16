import { getAccessToken } from './supabase';

/**
 * 通过服务器代理调用 AI 图像生成/编辑 API
 * 所有 API key 和计费逻辑都在服务器端处理
 */

// API 服务器地址，开发时可以通过环境变量配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
/**
 * 生成图片
 * @param {Object} params
 * @param {string} params.prompt - 提示词
 * @param {string} params.modelId - 模型ID
 * @param {string} params.modelName - 模型名称（备选）
 * @param {string} params.aspectRatio - 宽高比
 * @param {string} params.size - 图片尺寸
 * @returns {Promise<{mimeType: string, base64: string}>}
 */
export async function generateImage({ prompt, modelId, modelName, aspectRatio = '1:1', size = '2k' }) {
  console.log('[DEBUG] generateImage called');
  const token = await getAccessToken();
  console.log('[DEBUG] token obtained:', token ? 'yes' : 'no');
  
  const response = await fetch(`${API_BASE_URL}/ai-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      actionType: 'generate',
      modelId,
      modelName,
      prompt,
      aspectRatio,
      size,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || '生成失败');
  }

  return data;
}

/**
 * 编辑图片
 * @param {Object} params
 * @param {string} params.imageBase64 - 原图 base64
 * @param {string} params.imageMimeType - 原图 MIME 类型
 * @param {string} params.maskBase64 - 遮罩 base64
 * @param {string} params.prompt - 编辑提示词
 * @param {string} params.modelId - 模型ID
 * @param {string} params.modelName - 模型名称（备选）
 * @param {string} params.aspectRatio - 宽高比
 * @param {string} params.size - 图片尺寸
 * @returns {Promise<{mimeType: string, base64: string}>}
 */
export async function editImage({
  imageBase64,
  imageMimeType = 'image/png',
  maskBase64,
  prompt,
  modelId,
  modelName,
  aspectRatio = '1:1',
  size = '2k',
}) {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE_URL}/ai-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      actionType: 'edit',
      modelId,
      modelName,
      prompt,
      aspectRatio,
      size,
      imageBase64,
      imageMimeType,
      maskBase64,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || '编辑失败');
  }

  return data;
}
