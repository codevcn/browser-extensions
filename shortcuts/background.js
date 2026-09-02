const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const REGION_SCAN_MESSAGE = 'shortcuts:region-scan';
const OCR_MESSAGE = 'shortcuts:ocr';
const ANNOTATE_MESSAGE = 'shortcuts:annotate-screenshot';

const activeOcrRequests = new Map();
let creatingOffscreenDocument = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return undefined;

  if (message.target === 'background' && message.type === `${OCR_MESSAGE}:progress`) {
    forwardOcrProgress(message).catch((error) => {
      console.warn('[Shortcuts Extension: OCR progress]', error);
    });
    return undefined;
  }

  if (message.target === 'background' && message.type === `${OCR_MESSAGE}:idle`) {
    closeIdleOffscreenDocument().catch((error) => {
      console.warn('[Shortcuts Extension: Offscreen cleanup]', error);
    });
    return undefined;
  }

  if (message.target === 'background' && message.type === `${ANNOTATE_MESSAGE}:capture`) {
    handleAnnotatedScreenshotCapture(message, sender)
      .then(sendResponse)
      .catch((error) => {
        console.error('[Shortcuts Extension: Annotate Screenshot]', error);
        sendResponse({
          ok: false,
          error: getErrorMessage(error)
        });
      });
    return true;
  }

  if (message.target === 'background' && message.type === `${ANNOTATE_MESSAGE}:copy-image`) {
    copyImageToClipboard(message)
      .then(sendResponse)
      .catch((error) => {
        console.error('[Shortcuts Extension: Annotated Screenshot Clipboard]', error);
        sendResponse({
          ok: false,
          error: getErrorMessage(error)
        });
      });
    return true;
  }

  if (message.target === 'background' && message.type === `${ANNOTATE_MESSAGE}:save`) {
    saveAnnotatedScreenshot(message)
      .then(sendResponse)
      .catch((error) => {
        console.error('[Shortcuts Extension: Annotated Screenshot Save]', error);
        sendResponse({
          ok: false,
          error: getErrorMessage(error)
        });
      });
    return true;
  }

  if (message.target === 'background' && message.type === `${REGION_SCAN_MESSAGE}:recognize`) {
    handleRegionRecognition(message, sender)
      .then(sendResponse)
      .catch((error) => {
        console.error('[Shortcuts Extension: Region OCR]', error);
        sendResponse({
          ok: false,
          error: getErrorMessage(error)
        });
      });
    return true;
  }

  return undefined;
});

async function handleAnnotatedScreenshotCapture(message, sender) {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;

  if (!Number.isInteger(tabId) || !Number.isInteger(windowId)) {
    throw new Error('Annotated screenshot capture must be started from a browser tab.');
  }

  const requestId = normalizeRequestId(message.requestId);
  const area = normalizeRect(message.area);
  const viewport = normalizeViewport(message.viewport);
  const annotations = normalizeAnnotations(message.annotations);

  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  if (activeTab?.id !== tabId) {
    throw new Error('The source tab is no longer active. Return to it and run Annotate Screenshot again.');
  }

  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'png'
  });

  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: `${ANNOTATE_MESSAGE}:render`,
    requestId,
    screenshotDataUrl,
    area,
    viewport,
    annotations
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Annotated screenshot rendering failed without an error message.');
  }

  return {
    ok: true,
    dataUrl: String(response.dataUrl || ''),
    filename: createAnnotatedScreenshotFilename()
  };
}

async function copyImageToClipboard(message) {
  const dataUrl = normalizePngDataUrl(message.dataUrl);

  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: `${ANNOTATE_MESSAGE}:copy-image`,
    dataUrl
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Annotated screenshot clipboard write failed.');
  }

  return { ok: true };
}

async function saveAnnotatedScreenshot(message) {
  const dataUrl = normalizePngDataUrl(message.dataUrl);
  const filename = sanitizeFilename(message.filename || createAnnotatedScreenshotFilename());

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true
  });

  return { ok: true, filename };
}

async function handleRegionRecognition(message, sender) {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;

  if (!Number.isInteger(tabId) || !Number.isInteger(windowId)) {
    throw new Error('Region OCR must be started from a browser tab.');
  }

  const requestId = normalizeRequestId(message.requestId);
  const rect = normalizeRect(message.rect);
  const viewport = normalizeViewport(message.viewport);

  activeOcrRequests.set(requestId, tabId);

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (activeTab?.id !== tabId) {
      throw new Error('The source tab is no longer active. Return to it and run Scan Region To Text again.');
    }

    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'png'
    });

    await signalCaptureComplete(tabId, requestId);
    await ensureOffscreenDocument();

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: `${OCR_MESSAGE}:recognize`,
      requestId,
      screenshotDataUrl,
      rect,
      viewport
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'OCR failed without an error message.');
    }

    return {
      ok: true,
      text: String(response.text || ''),
      confidence: Number.isFinite(response.confidence) ? response.confidence : null
    };
  } finally {
    activeOcrRequests.delete(requestId);
  }
}

async function signalCaptureComplete(tabId, requestId) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: `${REGION_SCAN_MESSAGE}:capture-complete`,
      requestId
    });
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;
  }
}

async function forwardOcrProgress(message) {
  const requestId = normalizeRequestId(message.requestId);
  const tabId = activeOcrRequests.get(requestId);
  if (!Number.isInteger(tabId)) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: `${REGION_SCAN_MESSAGE}:progress`,
      requestId,
      status: String(message.status || 'Recognizing text'),
      progress: clampProgress(message.progress)
    });
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;
  }
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['WORKERS', 'CLIPBOARD'],
      justification: 'Run local OCR and copy rendered annotated screenshots without injecting heavy extension code into websites.'
    });
  }

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });
    return contexts.length > 0;
  }

  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function closeIdleOffscreenDocument() {
  if (activeOcrRequests.size > 0) return;
  if (!(await hasOffscreenDocument())) return;

  await chrome.offscreen.closeDocument();
}

function normalizeRequestId(value) {
  const requestId = String(value || '').trim();
  if (!requestId || requestId.length > 120) {
    throw new Error('Invalid OCR request ID.');
  }
  return requestId;
}

function normalizeRect(value) {
  const rect = value && typeof value === 'object' ? value : {};
  const left = Number(rect.left);
  const top = Number(rect.top);
  const width = Number(rect.width);
  const height = Number(rect.height);

  if (![left, top, width, height].every(Number.isFinite)) {
    throw new Error('Invalid scan rectangle.');
  }

  if (width < 1 || height < 1) {
    throw new Error('The selected scan region is empty.');
  }

  return { left, top, width, height };
}

function normalizeViewport(value) {
  const viewport = value && typeof value === 'object' ? value : {};
  const width = Number(viewport.width);
  const height = Number(viewport.height);

  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Invalid viewport dimensions.');
  }

  return { width, height };
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

function normalizePngDataUrl(value) {
  const dataUrl = String(value || '');
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Invalid annotated screenshot PNG.');
  }

  return dataUrl;
}

function createAnnotatedScreenshotFilename() {
  return `annotated-screenshot-${formatTimestamp(new Date())}.png`;
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');

  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-') +
    '-' +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-');
}

function sanitizeFilename(filename) {
  const sanitized = String(filename || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  const safeName = reservedWindowsNames.test(sanitized) ? `_${sanitized}` : sanitized;

  return safeName.slice(0, 180) || createAnnotatedScreenshotFilename();
}

function clampProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return null;
  return Math.min(1, Math.max(0, progress));
}

function isMissingReceiverError(error) {
  const message = getErrorMessage(error);
  return message.includes('Receiving end does not exist') || message.includes('Could not establish connection');
}

function getErrorMessage(error) {
  return error?.message || String(error || 'Unknown error');
}
