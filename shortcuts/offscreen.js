const OCR_MESSAGE = 'shortcuts:ocr';
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
  if (!message || message.target !== 'offscreen' || message.type !== `${OCR_MESSAGE}:recognize`) {
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
