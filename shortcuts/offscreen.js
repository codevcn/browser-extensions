const OCR_MESSAGE = 'shortcuts:ocr';
const ANNOTATE_MESSAGE = 'shortcuts:annotate-screenshot';
const OCR_LANGUAGE = 'eng+vie';
const OCR_IDLE_TIMEOUT_MS = 120_000;
const MAX_UPSCALE = 2;
const SMALL_CROP_THRESHOLD = 1_000_000;

let workerPromise = null;
let workerInstance = null;
let idleTimer = null;
let currentOcrRequestId = null;
let recognitionQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') {
    return undefined;
  }

  if (message.type === `${ANNOTATE_MESSAGE}:render`) {
    renderAnnotatedScreenshot(message)
      .then(sendResponse)
      .catch((error) => {
        console.error('[Shortcuts Extension: Annotated screenshot render]', error);
        sendResponse({
          ok: false,
          error: error?.message || String(error || 'Unknown annotated screenshot render error')
        });
      });
    return true;
  }

  if (message.type === `${ANNOTATE_MESSAGE}:copy-image`) {
    copyImageToClipboard(message.dataUrl)
      .then(sendResponse)
      .catch((error) => {
        console.error('[Shortcuts Extension: Annotated screenshot clipboard]', error);
        sendResponse({
          ok: false,
          error: error?.message || String(error || 'Unknown annotated screenshot clipboard error')
        });
      });
    return true;
  }

  if (message.type !== `${OCR_MESSAGE}:recognize`) {
    return undefined;
  }

  const job = recognitionQueue.then(() => recognizeRegion(message));
  recognitionQueue = job.catch(() => {});

  job
    .then(sendResponse)
    .catch((error) => {
      console.error('[Shortcuts Extension: Offscreen OCR]', error);
      sendResponse({
        ok: false,
        error: error?.message || String(error || 'Unknown OCR error')
      });
    });

  return true;
});

async function renderAnnotatedScreenshot(message) {
  const dataUrlString = String(message.screenshotDataUrl || '');
  if (!dataUrlString.startsWith('data:image/png;base64,')) {
    throw new Error('Chrome did not return a PNG screenshot.');
  }

  const area = normalizeRect(message.area);
  const viewport = normalizeViewport(message.viewport);
  const annotations = normalizeAnnotations(message.annotations);
  const image = await loadImage(dataUrlString);

  const scaleX = image.naturalWidth / viewport.width;
  const scaleY = image.naturalHeight / viewport.height;
  const sourceX = clamp(Math.round(area.left * scaleX), 0, image.naturalWidth - 1);
  const sourceY = clamp(Math.round(area.top * scaleY), 0, image.naturalHeight - 1);
  const sourceWidth = clamp(Math.round(area.width * scaleX), 1, image.naturalWidth - sourceX);
  const sourceHeight = clamp(Math.round(area.height * scaleY), 1, image.naturalHeight - sourceY);

  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: false
  });

  if (!context) {
    throw new Error('Canvas is unavailable for annotated screenshot rendering.');
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  annotations.forEach((annotation) => {
    drawAnnotation(context, annotation, area, scaleX, scaleY);
  });

  return {
    ok: true,
    dataUrl: canvas.toDataURL('image/png')
  };
}

async function copyImageToClipboard(dataUrl) {
  const blob = await dataUrlToBlob(dataUrl);
  const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });

  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard write is not available in this browser.');
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': pngBlob
    })
  ]);

  return { ok: true };
}

function drawAnnotation(context, annotation, area, scaleX, scaleY) {
  if (annotation.type === 'text') {
    context.save();
    context.fillStyle = annotation.color;
    drawText(context, annotation, area, scaleX, scaleY);
    context.restore();
    return;
  }

  const lineWidth = Math.max(1, annotation.lineWidth * ((scaleX + scaleY) / 2));
  const start = translatePoint(annotation.start, area, scaleX, scaleY);
  const end = translatePoint(annotation.end, area, scaleX, scaleY);

  context.save();
  context.strokeStyle = annotation.color;
  context.fillStyle = annotation.color;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (annotation.type === 'arrow') {
    drawArrow(context, start, end, lineWidth);
  } else if (annotation.type === 'rect') {
    drawRectangle(context, start, end);
  }

  context.restore();
}

function drawArrow(context, start, end, lineWidth) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 1) return;

  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const headLength = Math.max(20, lineWidth * 5.5);
  const headWidth = Math.max(18, lineWidth * 5);
  const baseCenter = {
    x: end.x - unitX * headLength,
    y: end.y - unitY * headLength
  };
  const perpendicularX = -unitY;
  const perpendicularY = unitX;

  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(baseCenter.x, baseCenter.y);
  context.stroke();

  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(
    baseCenter.x + perpendicularX * (headWidth / 2),
    baseCenter.y + perpendicularY * (headWidth / 2)
  );
  context.lineTo(
    baseCenter.x - perpendicularX * (headWidth / 2),
    baseCenter.y - perpendicularY * (headWidth / 2)
  );
  context.closePath();
  context.fill();
}

function drawRectangle(context, start, end) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 1 || height < 1) return;

  context.strokeRect(left, top, width, height);
}

function drawText(context, annotation, area, scaleX, scaleY) {
  const lines = splitTextLines(annotation.text);
  if (!lines.length) return;

  const averageScale = (scaleX + scaleY) / 2;
  const point = translatePoint(annotation.point, area, scaleX, scaleY);
  const fontSize = Math.max(1, annotation.fontSize * averageScale);
  const lineHeight = fontSize * annotation.lineHeight;
  const firstLineY = point.y - (lines.length - 1) * lineHeight;

  context.font = `${annotation.fontWeight} ${fontSize}px ${annotation.fontFamily}`;
  context.textBaseline = 'alphabetic';

  lines.forEach((line, index) => {
    context.fillText(line, point.x, firstLineY + index * lineHeight);
  });
}

function translatePoint(point, area, scaleX, scaleY) {
  return {
    x: (point.x - area.left) * scaleX,
    y: (point.y - area.top) * scaleY
  };
}

async function recognizeRegion(message) {
  assertOcrAssetsAvailable();
  clearIdleTimer();

  const requestId = String(message.requestId || '');
  currentOcrRequestId = requestId;
  const cropDataUrl = await cropScreenshot(message.screenshotDataUrl, message.rect, message.viewport);
  const worker = await getOcrWorker();

  sendProgress(requestId, 'recognizing text', 0);

  try {
    const result = await worker.recognize(cropDataUrl);

    return {
      ok: true,
      text: String(result?.data?.text || ''),
      confidence: Number.isFinite(result?.data?.confidence) ? result.data.confidence : null
    };
  } finally {
    scheduleIdleWorkerCleanup();
  }
}

async function getOcrWorker() {
  if (workerInstance) return workerInstance;
  if (workerPromise) return workerPromise;

  const tesseract = globalThis.Tesseract;
  const workerPath = chrome.runtime.getURL('vendor/tesseract/worker.min.js');
  const langPath = chrome.runtime.getURL('vendor/tesseract/lang');
  const corePath = chrome.runtime.getURL('vendor/tesseract/core');

  workerPromise = tesseract.createWorker(OCR_LANGUAGE, tesseract.OEM.LSTM_ONLY, {
    workerPath,
    langPath,
    corePath,
    workerBlobURL: false,
    gzip: true,
    logger: (message) => {
      sendProgress(currentOcrRequestId, message?.status, message?.progress);
    },
    errorHandler: (error) => {
      console.error('[Shortcuts Extension: Tesseract worker]', error);
    }
  });

  try {
    workerInstance = await workerPromise;
    await workerInstance.setParameters({
      tessedit_pageseg_mode: tesseract.PSM.AUTO,
      preserve_interword_spaces: '1',
      user_defined_dpi: '150'
    });
    return workerInstance;
  } finally {
    workerPromise = null;
  }
}

async function cropScreenshot(dataUrl, rectValue, viewportValue) {
  const dataUrlString = String(dataUrl || '');
  if (!dataUrlString.startsWith('data:image/png;base64,')) {
    throw new Error('Chrome did not return a PNG screenshot for OCR.');
  }

  const rect = normalizeRect(rectValue);
  const viewport = normalizeViewport(viewportValue);
  const image = await loadImage(dataUrlString);

  const scaleX = image.naturalWidth / viewport.width;
  const scaleY = image.naturalHeight / viewport.height;

  const sourceX = clamp(Math.round(rect.left * scaleX), 0, image.naturalWidth - 1);
  const sourceY = clamp(Math.round(rect.top * scaleY), 0, image.naturalHeight - 1);
  const sourceWidth = clamp(Math.round(rect.width * scaleX), 1, image.naturalWidth - sourceX);
  const sourceHeight = clamp(Math.round(rect.height * scaleY), 1, image.naturalHeight - sourceY);

  const sourcePixels = sourceWidth * sourceHeight;
  const upscale = sourcePixels < SMALL_CROP_THRESHOLD ? MAX_UPSCALE : 1;
  const targetWidth = Math.max(1, sourceWidth * upscale);
  const targetHeight = Math.max(1, sourceHeight * upscale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: false
  });

  if (!context) {
    throw new Error('Canvas is unavailable for OCR preprocessing.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  return canvas.toDataURL('image/png');
}

function assertOcrAssetsAvailable() {
  if (!globalThis.Tesseract?.createWorker) {
    throw new Error('OCR runtime assets are missing or failed to load.');
  }
}

function sendProgress(requestId, status, progress) {
  chrome.runtime.sendMessage({
    target: 'background',
    type: `${OCR_MESSAGE}:progress`,
    requestId: String(requestId || ''),
    status: String(status || 'Recognizing text'),
    progress: Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : null
  }).catch(() => {
    // The requesting tab may have closed; OCR itself can continue safely.
  });
}

function normalizeAnnotations(value) {
  const annotations = Array.isArray(value) ? value : [];

  return annotations.map((annotation) => {
    const type = annotation?.type === 'arrow' ? 'arrow' : annotation?.type === 'rect' ? 'rect' : annotation?.type === 'text' ? 'text' : '';
    if (!type) throw new Error('Invalid screenshot annotation type.');

    if (type === 'text') {
      return {
        type,
        point: normalizePoint(annotation.point),
        text: normalizeAnnotationText(annotation.text),
        color: normalizeColor(annotation.color),
        fontSize: normalizeFontSize(annotation.fontSize),
        lineHeight: normalizeLineHeight(annotation.lineHeight),
        fontWeight: normalizeFontWeight(annotation.fontWeight),
        fontFamily: normalizeFontFamily(annotation.fontFamily)
      };
    }

    return {
      type,
      start: normalizePoint(annotation.start),
      end: normalizePoint(annotation.end),
      color: normalizeColor(annotation.color),
      lineWidth: normalizeLineWidth(annotation.lineWidth)
    };
  });
}

function normalizePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);

  if (![x, y].every(Number.isFinite)) {
    throw new Error('Invalid screenshot annotation point.');
  }

  return { x, y };
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error('Invalid screenshot annotation color.');
  }

  return color;
}

function normalizeLineWidth(value) {
  const lineWidth = Number(value);
  if (!Number.isFinite(lineWidth)) {
    throw new Error('Invalid screenshot annotation line width.');
  }

  return Math.min(50, Math.max(1, lineWidth));
}

function normalizeAnnotationText(value) {
  const text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .trim();

  if (!text) {
    throw new Error('Invalid screenshot annotation text.');
  }

  return text.slice(0, 2000);
}

function splitTextLines(value) {
  return normalizeAnnotationText(value).split('\n').filter((line) => line.length > 0);
}

function normalizeFontSize(value) {
  const fontSize = Number(value);
  if (!Number.isFinite(fontSize)) {
    throw new Error('Invalid screenshot annotation font size.');
  }

  return Math.min(96, Math.max(6, fontSize));
}

function normalizeLineHeight(value) {
  const lineHeight = Number(value);
  if (!Number.isFinite(lineHeight)) {
    throw new Error('Invalid screenshot annotation line height.');
  }

  return Math.min(3, Math.max(1, lineHeight));
}

function normalizeFontWeight(value) {
  const fontWeight = Number(value);
  if (!Number.isFinite(fontWeight)) return 700;

  return Math.min(900, Math.max(100, Math.round(fontWeight / 100) * 100));
}

function normalizeFontFamily(value) {
  const fontFamily = String(value || '').trim();
  return fontFamily ? fontFamily.slice(0, 120) : 'Arial, sans-serif';
}

async function dataUrlToBlob(dataUrl) {
  const dataUrlString = String(dataUrl || '');
  if (!dataUrlString.startsWith('data:image/png;base64,')) {
    throw new Error('Invalid annotated screenshot PNG.');
  }

  const response = await fetch(dataUrlString);
  return response.blob();
}

function scheduleIdleWorkerCleanup() {
  clearIdleTimer();
  idleTimer = setTimeout(async () => {
    try {
      if (workerInstance) {
        await workerInstance.terminate();
      }
    } catch (error) {
      console.warn('[Shortcuts Extension: OCR worker cleanup]', error);
    } finally {
      workerInstance = null;
      workerPromise = null;
      idleTimer = null;
      chrome.runtime.sendMessage({
        target: 'background',
        type: `${OCR_MESSAGE}:idle`
      }).catch(() => {});
    }
  }, OCR_IDLE_TIMEOUT_MS);
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode the captured screenshot.'));
    image.src = src;
  });
}

function normalizeRect(value) {
  const rect = value && typeof value === 'object' ? value : {};
  const left = Number(rect.left);
  const top = Number(rect.top);
  const width = Number(rect.width);
  const height = Number(rect.height);

  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Invalid OCR rectangle.');
  }

  return { left, top, width, height };
}

function normalizeViewport(value) {
  const viewport = value && typeof value === 'object' ? value : {};
  const width = Number(viewport.width);
  const height = Number(viewport.height);

  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Invalid OCR viewport size.');
  }

  return { width, height };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
