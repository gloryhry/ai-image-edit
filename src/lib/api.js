export const API_CONFIG = {
    baseUrl: 'https://foxi-ai.top', // Default, can be overridden
    apiKey: '', // User must provide
    timeoutMs: 300_000, // 300 秒
};

const GEMINI_OFFICIAL_BASE_URL = 'https://generativelanguage.googleapis.com';

const buildGeminiAuth = ({ apiKey, authMode = 'auto' }) => {
    const mode = authMode || 'auto';
    if (mode !== 'auto' && mode !== 'header' && mode !== 'query') {
        throw new Error(`Unsupported Gemini authMode: ${String(mode)}`);
    }

    const asHeader = () => ({
        urlSuffix: '',
        headers: { 'x-goog-api-key': apiKey },
    });
    const asQuery = () => ({
        urlSuffix: `?key=${encodeURIComponent(apiKey)}`,
        headers: {},
    });

    if (mode === 'query') return asQuery();
    if (mode === 'header') return asHeader();
    return { primary: asHeader(), fallback: asQuery() };
};

const isLikelyCorsOrHeaderBlockedError = (err) => {
    const message = String(err?.message || '');
    return (
        message.includes('网络请求失败') ||
        message.includes('Failed to fetch') ||
        message.includes('CORS') ||
        message.includes('Access-Control') ||
        message.includes('X-Goog-Upload-URL')
    );
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = API_CONFIG.timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒）`);
        }
        // 浏览器网络层错误（例如 net::ERR_CONNECTION_CLOSED / CORS 阻止 / 断网）通常会表现为 TypeError: Failed to fetch
        if (err instanceof TypeError) {
            throw new Error(
                '网络请求失败：连接被中断（可能是服务端主动断开、网络/代理不稳定、或请求体过大导致网关重置连接）。'
            );
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

const isLikelyBase64 = (value) => {
    if (!value || typeof value !== 'string') return false;
    // very loose check: base64 chars, optional padding, no whitespace
    return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length > 64;
};

const parseDataUrl = (value) => {
    if (!value || typeof value !== 'string') return null;
    if (!value.startsWith('data:image/')) return null;
    const [meta, b64] = value.split(',');
    if (!b64) return null;
    const mimeType = meta.split(';')[0].slice('data:'.length) || 'image/png';
    return { mimeType, base64: b64 };
};

const base64ToBlob = (base64, mimeType = 'image/png') => {
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
};

const normalizeGeminiInlineData = (inlineData) => {
    if (!inlineData || typeof inlineData !== 'object') return null;
    const base64 = inlineData.data || null;
    const mimeType = inlineData.mime_type || inlineData.mimeType || 'image/png';
    if (!base64 || typeof base64 !== 'string') return null;
    return { base64, mimeType };
};

const extractBase64ImageFromGemini = (payload) => {
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;

    for (const part of parts) {
        const inlineData = part?.inline_data || part?.inlineData;
        const normalized = normalizeGeminiInlineData(inlineData);
        if (normalized) return normalized;
    }
    return null;
};

/**
 * Download remote image and convert to base64
 */
const downloadImageAsBase64 = async (imageUrl) => {
    try {
        const response = await fetchWithTimeout(imageUrl, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.status}`);
        }

        const blob = await response.blob();
        const mimeType = blob.type || 'image/png';

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.split(',')[1];
                resolve({ mimeType, base64 });
            };
            reader.onerror = reject;
        });
    } catch (error) {
        console.error('Error downloading image:', error);
        throw error;
    }
};

const uploadFileViaGeminiOfficial = async ({ dataUrl, apiKey, filename = 'upload.png', authMode = 'auto' }) => {
    if (!apiKey) throw new Error('上传失败：缺少 Gemini API Key');

    let parsed = null;
    if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
        throw new Error('上传失败：缺少文件数据');
    }

    if (/^https?:\/\//i.test(dataUrl)) {
        const downloaded = await downloadImageAsBase64(dataUrl);
        parsed = { mimeType: downloaded.mimeType || 'image/png', base64: downloaded.base64 };
    } else {
        parsed = parseDataUrl(dataUrl);
        if (!parsed) throw new Error('上传失败：Gemini 官方仅支持图片 dataURL 或 http(s) URL');
    }

    const blob = base64ToBlob(parsed.base64, parsed.mimeType);
    const numBytes = blob.size;

    const baseStartUrl = `${GEMINI_OFFICIAL_BASE_URL}/upload/v1beta/files`;
    const startBody = {
        file: {
            display_name: filename,
        },
    };

    const doStart = async ({ urlSuffix, headers }) => {
        return fetchWithTimeout(`${baseStartUrl}${urlSuffix}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': String(numBytes),
                'X-Goog-Upload-Header-Content-Type': parsed.mimeType,
            },
            body: JSON.stringify(startBody),
        });
    };

    const auth = buildGeminiAuth({ apiKey, authMode });
    const primary = auth.primary || auth;
    const fallback = auth.fallback || null;

    let startResponse = null;
    try {
        startResponse = await doStart(primary);
    } catch (err) {
        if (fallback && isLikelyCorsOrHeaderBlockedError(err)) {
            startResponse = await doStart(fallback);
        } else {
            throw err;
        }
    }

    if (!startResponse.ok) {
        let message = '文件上传失败（初始化）';
        try {
            const err = await startResponse.json();
            message = err?.error?.message || message;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    const getUploadUrlFromHeaders = (response) =>
        response.headers.get('X-Goog-Upload-URL') || response.headers.get('x-goog-upload-url');

    let uploadUrl = getUploadUrlFromHeaders(startResponse);
    if (!uploadUrl && fallback && authMode === 'auto') {
        const retryStart = await doStart(fallback);
        if (retryStart.ok) uploadUrl = getUploadUrlFromHeaders(retryStart);
    }
    if (!uploadUrl) {
        throw new Error('文件上传失败：未获取到 Gemini 上传地址（X-Goog-Upload-URL），可能是浏览器无法读取该响应头（CORS Expose-Headers）。');
    }

    const uploadResponse = await fetchWithTimeout(uploadUrl, {
        method: 'POST',
        headers: {
            // 注意：浏览器禁止手动设置 Content-Length，这里交给 fetch 自动处理
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: blob,
    });

    if (!uploadResponse.ok) {
        let message = '文件上传失败（上传内容）';
        try {
            const err = await uploadResponse.json();
            message = err?.error?.message || message;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    const info = await uploadResponse.json();
    const file = info?.file;
    const uri = file?.uri || null;
    if (!uri) throw new Error('文件上传失败：响应中缺少 file.uri');

    return {
        id: file?.name,
        name: file?.name,
        uri,
        url: uri,
        mimeType: file?.mime_type || file?.mimeType || parsed.mimeType,
    };
};

export async function uploadFile({
    dataUrl,
    apiKey,
    baseUrl,
    filename = 'upload.png',
    apiProvider = 'openai_compat',
    geminiApiKey,
    geminiAuthMode = 'auto',
}) {
    if (apiProvider === 'gemini_official') {
        return uploadFileViaGeminiOfficial({
            dataUrl,
            apiKey: geminiApiKey || apiKey,
            filename,
            authMode: geminiAuthMode,
        });
    }

    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/files`;

    // 支持传入 data:image/... 或 https://...
    if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
        throw new Error('上传失败：缺少文件数据');
    }
    if (/^https?:\/\//i.test(dataUrl)) {
        return { url: dataUrl };
    }

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) throw new Error('上传失败：仅支持图片 dataURL');

    const formData = new FormData();
    formData.append('file', base64ToBlob(parsed.base64, parsed.mimeType), filename);

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
        },
        body: formData
    });

    if (!response.ok) {
        let message = '文件上传失败';
        try {
            const err = await response.json();
            message = err.error?.message || message;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    const data = await response.json();
    if (!data?.url) throw new Error('文件上传失败：响应中缺少 url');
    return data; // { id, url, ... }
}

const extractBase64ImageFromChat = async (payload) => {
    // Try common shapes (provider variations)
    const candidates = [];

    // 1) OpenAI-like images API passthrough
    const directB64 = payload?.data?.[0]?.b64_json;
    if (typeof directB64 === 'string') candidates.push({ mimeType: 'image/png', base64: directB64 });

    // 2) chat.completions: choices[0].message.content (string or array)
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
        // Check for markdown image format: ![image](url)
        const markdownImageMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
        if (markdownImageMatch) {
            const imageUrl = markdownImageMatch[1];
            try {
                return await downloadImageAsBase64(imageUrl);
            } catch (error) {
                console.error('Failed to download markdown image:', error);
                // Continue to try other formats
            }
        }

        const asDataUrl = parseDataUrl(content);
        if (asDataUrl) return asDataUrl;

        // maybe it is a raw base64 string
        if (isLikelyBase64(content)) return { mimeType: 'image/png', base64: content };

        // maybe it is JSON in string
        try {
            const obj = JSON.parse(content);
            const b64 = obj?.b64_json || obj?.image || obj?.data?.b64_json;
            const dataUrl = obj?.data_url || obj?.image_url || obj?.url;
            const parsed = parseDataUrl(dataUrl);
            if (parsed) return parsed;
            if (typeof b64 === 'string' && isLikelyBase64(b64)) return { mimeType: obj?.mime_type || 'image/png', base64: b64 };
        } catch {
            // ignore
        }
    }

    if (Array.isArray(content)) {
        for (const part of content) {
            const url = part?.image_url?.url || part?.image_url || part?.url;
            const parsed = parseDataUrl(url);
            if (parsed) return parsed;
            const b64 = part?.b64_json || part?.b64 || part?.image?.b64_json;
            if (typeof b64 === 'string' && isLikelyBase64(b64)) return { mimeType: part?.mime_type || 'image/png', base64: b64 };
        }
    }

    // 3) some providers place images in a separate field
    const maybeImages = payload?.images || payload?.output?.images || payload?.choices?.[0]?.message?.images;
    if (Array.isArray(maybeImages)) {
        for (const img of maybeImages) {
            const parsed = parseDataUrl(img?.data_url || img?.url);
            if (parsed) return parsed;
            const b64 = img?.b64_json || img?.b64;
            if (typeof b64 === 'string' && isLikelyBase64(b64)) return { mimeType: img?.mime_type || 'image/png', base64: b64 };
        }
    }

    // fallback to candidates
    if (candidates.length > 0) return candidates[0];
    return null;
};

/**
 * Helper to convert Blob/File to Base64
 */
export const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); // Remove data:image/...;base64,
        reader.onerror = error => reject(error);
    });
};

const geminiPostJsonWithFallback = async ({ url, apiKey, authMode = 'auto', body, defaultErrorMessage }) => {
    const auth = buildGeminiAuth({ apiKey, authMode });
    const primary = auth.primary || auth;
    const fallback = auth.fallback || null;

    const requestOnce = async ({ urlSuffix, headers }) => {
        return fetchWithTimeout(`${url}${urlSuffix}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(body),
        });
    };

    let response = null;
    try {
        response = await requestOnce(primary);
    } catch (err) {
        if (fallback && isLikelyCorsOrHeaderBlockedError(err)) {
            response = await requestOnce(fallback);
        } else {
            throw err;
        }
    }

    if (response.ok) {
        return { ok: true, data: await response.json(), message: null };
    }

    let message = defaultErrorMessage;
    try {
        const err = await response.json();
        message = err?.error?.message || message;
    } catch {
        // ignore
    }
    return { ok: false, data: null, message };
};

export async function generateImageViaGeminiOfficial({
    prompt,
    apiKey,
    model,
    aspectRatio = '1:1',
    imageSize = '1K',
    authMode = 'auto',
}) {
    const url = `${GEMINI_OFFICIAL_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }],
            },
        ],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio, imageSize },
        },
    };

    let result = await geminiPostJsonWithFallback({
        url,
        apiKey,
        authMode,
        body: requestBody,
        defaultErrorMessage: '生成失败',
    });

    if (!result.ok && requestBody?.generationConfig?.imageConfig) {
        const fallbackBody = {
            ...requestBody,
            generationConfig: { ...requestBody.generationConfig },
        };
        delete fallbackBody.generationConfig.imageConfig;
        result = await geminiPostJsonWithFallback({
            url,
            apiKey,
            authMode,
            body: fallbackBody,
            defaultErrorMessage: '生成失败',
        });
    }

    if (!result.ok) throw new Error(result.message);
    const extracted = extractBase64ImageFromGemini(result.data);
    if (!extracted) throw new Error('生成失败：未从 Gemini 响应中解析到图片数据');
    return extracted; // { mimeType, base64 }
}

export async function editImageViaGeminiOfficial({
    imageBase64,
    imageMimeType = 'image/png',
    maskBase64,
    prompt,
    apiKey,
    model,
    aspectRatio = '1:1',
    imageSize = '1K',
    authMode = 'auto',
}) {
    const url = `${GEMINI_OFFICIAL_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const instruction =
        `你将收到两张图片：第一张为原图，第二张为遮罩。\n` +
        `编辑规则（必须严格遵守）：\n` +
        `1) 只允许修改遮罩中【白色】区域的内容；遮罩中【黑色】区域必须与原图保持完全一致（像素级不变）。\n` +
        `2) 不要改动黑色区域的任何内容：包括但不限于构图、背景、人物/物体位置、轮廓、大小、颜色、光照、阴影、清晰度、对比度、风格、文字水印等。\n` +
        `3) 白色区域的边缘要自然融合，避免溢出到黑色区域；不要产生新的改动区域或额外元素。\n` +
        `4) 如果指令与“仅修改白色区域/黑色区域完全不变”冲突，优先保证黑色区域不变。\n` +
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
            imageConfig: { aspectRatio, imageSize },
        },
    };

    let result = await geminiPostJsonWithFallback({
        url,
        apiKey,
        authMode,
        body: requestBody,
        defaultErrorMessage: '编辑失败',
    });

    if (!result.ok && requestBody?.generationConfig?.imageConfig) {
        const fallbackBody = {
            ...requestBody,
            generationConfig: { ...requestBody.generationConfig },
        };
        delete fallbackBody.generationConfig.imageConfig;
        result = await geminiPostJsonWithFallback({
            url,
            apiKey,
            authMode,
            body: fallbackBody,
            defaultErrorMessage: '编辑失败',
        });
    }

    if (!result.ok) throw new Error(result.message);
    const extracted = extractBase64ImageFromGemini(result.data);
    if (!extracted) throw new Error('编辑失败：未从 Gemini 响应中解析到图片数据');
    return extracted; // { mimeType, base64 }
}

/**
 * Call the Gemini Image Generation API (OpenAI-compatible via third-party)
 */
export async function generateImage({ prompt, aspectRatio = '1:1', apiKey, baseUrl, model, size = '2k' }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/images/generations`;
    const IMAGE_TIMEOUT_MS = 200_000; // 200 秒超时

    let response;
    try {
        response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                prompt,
                model: model || "gemini-2.5-flash-image",
                n: 1,
                ratio: aspectRatio,
                resolution: size,
                response_format: "b64_json"
            })
        }, IMAGE_TIMEOUT_MS);
    } catch (err) {
        if (err?.message?.includes('请求超时')) {
            throw new Error('服务器负载较大，请重试');
        }
        throw err;
    }

    if (!response.ok) {
        const err = await response.json();
        const errMsg = err.error?.message || '';
        // 429 + 特定错误码 30：提示修改提示词
        if (response.status === 429 && errMsg.includes('API_IMAGE_GENERATION_FAILED') && errMsg.includes('30')) {
            throw new Error('请修改提示词后重试');
        }
        throw new Error(errMsg || '生成失败');
    }

    return await response.json();
}

/**
 * 使用 OpenAI Chat Completions 格式的“绘图模型”（例如 gemini-3-pro-image-preview）
 * 说明：不同服务商返回图片的字段可能不同，这里做了尽可能兼容的解析。
 */
export async function generateImageViaChatCompletions({ prompt, apiKey, baseUrl, model }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/chat/completions`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
        },
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: prompt }]
                }
            ]
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '生成失败');
    }

    const data = await response.json();
    const extracted = await extractBase64ImageFromChat(data);
    if (!extracted) throw new Error('生成失败：未从响应中解析到图片数据');
    return extracted; // { mimeType, base64 }
}

export async function editImageViaChatCompletions({ imageDataUrl, maskDataUrl, prompt, apiKey, baseUrl, model }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/chat/completions`;

    // 先上传为 URL，避免把超大 base64 塞进 JSON 导致连接被网关断开
    const uploadedImage = await uploadFile({
        dataUrl: imageDataUrl,
        apiKey,
        baseUrl,
        filename: 'image.png',
    });
    const uploadedMask = await uploadFile({
        dataUrl: maskDataUrl,
        apiKey,
        baseUrl,
        filename: 'mask.png',
    });

    const instruction =
        `你将收到两张图片：第一张为原图，第二张为遮罩。\n` +
        `编辑规则（必须严格遵守）：\n` +
        `1) 只允许修改遮罩中【白色】区域的内容；遮罩中【黑色】区域必须与原图保持完全一致（像素级不变）。\n` +
        `2) 不要改动黑色区域的任何内容：包括但不限于构图、背景、人物/物体位置、轮廓、大小、颜色、光照、阴影、清晰度、对比度、风格、文字水印等。\n` +
        `3) 白色区域的边缘要自然融合，避免溢出到黑色区域；不要产生新的改动区域或额外元素。\n` +
        `4) 如果指令与“仅修改白色区域/黑色区域完全不变”冲突，优先保证黑色区域不变。\n` +
        `编辑要求：\n${prompt}\n` +
        `仅输出一张编辑后的图片，不要输出任何解释文字。`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
        },
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: instruction },
                        { type: 'image_url', image_url: { url: uploadedImage.url } },
                        { type: 'image_url', image_url: { url: uploadedMask.url } },
                    ]
                }
            ]
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || '编辑失败');
    }

    const data = await response.json();
    const extracted = await extractBase64ImageFromChat(data);
    if (!extracted) throw new Error('编辑失败：未从响应中解析到图片数据');
    return extracted; // { mimeType, base64 }
}

/**
 * Call the Image Edit API using OpenAI-compatible format
 * According to API docs: /v1/images/edits with multipart/form-data
 * Sends image and mask as separate file uploads
 */
export async function editImage({ imageBase64, maskBase64, prompt, apiKey, baseUrl, model, imageMimeType = 'image/png', ratio = '1:1', resolution = '2k' }) {
    const url = `${baseUrl || API_CONFIG.baseUrl}/v1/images/edits`;
    const IMAGE_TIMEOUT_MS = 200_000; // 200 秒超时

    // Create FormData
    const formData = new FormData();
    formData.append('model', model || 'nano-banana');
    formData.append('prompt', prompt);
    formData.append('ratio', ratio);
    formData.append('resolution', resolution);

    // Append image files
    const imageBlob = base64ToBlob(imageBase64, imageMimeType);
    const maskBlob = base64ToBlob(maskBase64);

    formData.append('image', imageBlob, 'image.png');
    formData.append('image', maskBlob, 'mask.png');

    formData.append('response_format', 'b64_json');

    let response;
    try {
        response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey || API_CONFIG.apiKey}`
                // Don't set Content-Type - browser will set it with boundary
            },
            body: formData
        }, IMAGE_TIMEOUT_MS);
    } catch (err) {
        if (err?.message?.includes('请求超时')) {
            throw new Error('服务器负载较大，请重试');
        }
        throw err;
    }

    if (!response.ok) {
        const err = await response.json();
        const errMsg = err.error?.message || '';
        // 429 + 特定错误码 30：提示修改提示词
        if (response.status === 429 && errMsg.includes('API_IMAGE_GENERATION_FAILED') && errMsg.includes('30')) {
            throw new Error('请修改提示词后重试');
        }
        throw new Error(errMsg || '编辑失败');
    }

    const data = await response.json();
    // Return base64 image data
    return data.data?.[0]?.b64_json;
}
