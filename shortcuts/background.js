const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const REGION_SCAN_MESSAGE = 'shortcuts:region-scan';
const OCR_MESSAGE = 'shortcuts:ocr';

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
      reasons: ['WORKERS'],
      justification: 'Run the bundled Tesseract Web Worker for local OCR without injecting the OCR engine into websites.'
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
