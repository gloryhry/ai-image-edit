function parseMaxDimensionsFromSize(size) {
  const raw = String(size || '').trim().toLowerCase();
  if (!raw) return null;

  const wh = raw.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (wh) {
    const maxWidth = Number.parseInt(wh[1], 10);
    const maxHeight = Number.parseInt(wh[2], 10);
    if (!Number.isFinite(maxWidth) || !Number.isFinite(maxHeight)) return null;
    return { maxWidth, maxHeight };
  }

  const k = raw.match(/^(\d+)\s*k$/i);
  if (k) {
    const multiple = Number.parseInt(k[1], 10);
    if (!Number.isFinite(multiple) || multiple <= 0) return null;
    const px = multiple * 1024;
    return { maxWidth: px, maxHeight: px };
  }

  const square = raw.match(/^(\d+)$/);
  if (square) {
    const px = Number.parseInt(square[1], 10);
    if (!Number.isFinite(px) || px <= 0) return null;
    return { maxWidth: px, maxHeight: px };
  }

  return null;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

export async function getBase64ImageDimensions({ base64, mimeType }) {
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const img = await loadImage(dataUrl);
  return { width: img.width, height: img.height };
}

export async function resizeBase64ImageTo({ base64, mimeType, width, height, quality }) {
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 Canvas 上下文');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const outUrl = typeof quality === 'number'
    ? canvas.toDataURL(mimeType, quality)
    : canvas.toDataURL(mimeType);

  const outMimeType = outUrl.split(';')[0].split(':')[1] || mimeType;
  const outBase64 = outUrl.split(',')[1];
  if (!outBase64) throw new Error('图片缩放失败');

  return { base64: outBase64, mimeType: outMimeType };
}

export function getDownscaleMultiplier({ originalWidth, originalHeight, size }) {
  const max = parseMaxDimensionsFromSize(size);
  if (!max) return 1;

  if (originalWidth <= max.maxWidth && originalHeight <= max.maxHeight) return 1;

  const multiplier = Math.min(
    max.maxWidth / originalWidth,
    max.maxHeight / originalHeight
  );

  if (!Number.isFinite(multiplier) || multiplier <= 0) return 1;
  return Math.min(1, multiplier);
}

