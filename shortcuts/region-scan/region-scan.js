(() => {
  const ROOT_ID = 'shortcuts-region-scan-root';
  const ACTIVE_FLAG = '__SHORTCUTS_REGION_SCAN_ACTIVE__';
  const MESSAGE_PREFIX = 'shortcuts:region-scan';
  const MIN_SELECTION_SIZE = 12;
  const PANEL_GAP = 10;
  const VIEWPORT_PADDING = 16;

  if (window[ACTIVE_FLAG]) {
    window[ACTIVE_FLAG].bringToFront?.();
    return { status: 'already-active' };
  }

  const state = {
    stage: 'awaiting-first-point',
    firstPoint: null,
    lockedRect: null,
    requestId: null,
    captureRestoreTimer: null,
    destroyed: false
  };

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.dataset.stage = state.stage;
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'Scan Region To Text');

  const selection = document.createElement('div');
  selection.className = 'shortcuts-region-scan__selection';
  selection.dataset.visible = 'false';
  selection.setAttribute('aria-hidden', 'true');

  const anchor = document.createElement('div');
  anchor.className = 'shortcuts-region-scan__anchor';
  anchor.dataset.visible = 'false';
  anchor.setAttribute('aria-hidden', 'true');

  const status = document.createElement('div');
  status.className = 'shortcuts-region-scan__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const okButton = document.createElement('button');
  okButton.className = 'shortcuts-region-scan__ok';
  okButton.type = 'button';
  okButton.textContent = 'OK';
  okButton.dataset.visible = 'false';
  okButton.setAttribute('aria-label', 'Close Scan Region To Text');

  const resultPanel = document.createElement('section');
  resultPanel.className = 'shortcuts-region-scan__result';
  resultPanel.dataset.visible = 'false';
  resultPanel.setAttribute('aria-label', 'Recognized text');

  const resultHeader = document.createElement('div');
  resultHeader.className = 'shortcuts-region-scan__result-header';
  resultHeader.textContent = 'Recognized text — drag to select, then Ctrl+C';

  const resultText = document.createElement('pre');
  resultText.className = 'shortcuts-region-scan__result-text';
  resultText.tabIndex = 0;

  resultPanel.append(resultHeader, resultText);
  root.append(selection, anchor, status, okButton, resultPanel);
  document.documentElement.append(root);

  setStatus('Click the top-left point.', 'Then click the bottom-right point to scan that rectangle.');

  root.addEventListener('pointerdown', handlePointerDown, true);
  root.addEventListener('pointermove', handlePointerMove, true);
  root.addEventListener('contextmenu', preventDefault, true);
  okButton.addEventListener('click', destroy);
  resultPanel.addEventListener('pointerdown', stopPropagation, true);
  resultPanel.addEventListener('click', stopPropagation, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('wheel', preventScroll, { capture: true, passive: false });
  window.addEventListener('touchmove', preventScroll, { capture: true, passive: false });
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  window[ACTIVE_FLAG] = {
    destroy,
    bringToFront() {
      if (root.isConnected) {
        root.style.zIndex = '2147483647';
      }
    }
  };

  return { status: 'started' };

  function handlePointerDown(event) {
    if (state.destroyed || event.button !== 0) return;
    if (resultPanel.contains(event.target) || okButton.contains(event.target)) return;
    if (state.stage === 'recognizing' || state.stage === 'result') return;

    event.preventDefault();
    event.stopPropagation();

    const point = clampPoint({ x: event.clientX, y: event.clientY });

    if (state.stage === 'awaiting-first-point') {
      state.firstPoint = point;
      state.stage = 'awaiting-second-point';
      root.dataset.stage = state.stage;
      setAnchor(point, true);
      setSelection(normalizeRectangle(point, point), true);
      setStatus('Top-left point set. Click the bottom-right point.', 'You can move the pointer to preview the rectangle. Esc or Ctrl+Q exits.');
      return;
    }

    if (state.stage === 'awaiting-second-point' && state.firstPoint) {
      const rect = normalizeRectangle(state.firstPoint, point);

      if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
        resetSelection('Selection is too small. Click the top-left point again.');
        return;
      }

      lockSelection(rect);
    }
  }

  function handlePointerMove(event) {
    if (state.destroyed || state.stage !== 'awaiting-second-point' || !state.firstPoint) return;
    const point = clampPoint({ x: event.clientX, y: event.clientY });
    setSelection(normalizeRectangle(state.firstPoint, point), true);
  }

  async function lockSelection(rect) {
    state.lockedRect = rect;
    state.stage = 'recognizing';
    state.requestId = createRequestId();
    root.dataset.stage = state.stage;

    setSelection(rect, true);
    setAnchor(null, false);
    resultPanel.dataset.visible = 'false';
    okButton.dataset.visible = 'true';
    setStatus('Preparing screenshot…', 'OCR runs locally in the extension. Esc, Ctrl+Q, or OK exits.');

    try {
      await waitForPaint();
      root.style.visibility = 'hidden';
      await waitForPaint();

      state.captureRestoreTimer = window.setTimeout(() => {
        if (!state.destroyed && root.style.visibility === 'hidden') {
          root.style.visibility = 'visible';
          setStatus('Recognizing text…', 'The screenshot was requested. OCR is continuing locally.');
        }
      }, 3000);

      const response = await chrome.runtime.sendMessage({
        target: 'background',
        type: `${MESSAGE_PREFIX}:recognize`,
        requestId: state.requestId,
        rect,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      });
      if (state.destroyed) return;

      if (!response?.ok) {
        throw new Error(response?.error || 'OCR failed.');
      }

      showResult(response.text, response.confidence);
    } catch (error) {
      if (state.destroyed) return;
      root.style.visibility = 'visible';
      showError(error);
    }
  }

  function showResult(text, confidence) {
    clearCaptureRestoreTimer();
    root.style.visibility = 'visible';
    state.stage = 'result';
    root.dataset.stage = state.stage;

    const normalizedText = normalizeRecognizedText(text);
    const confidenceText = Number.isFinite(confidence) ? ` · ${Math.round(confidence)}% confidence` : '';

    resultHeader.textContent = `Recognized text${confidenceText} — drag to select, then Ctrl+C`;
    resultText.textContent = normalizedText || 'No text detected in the selected region.';
    resultPanel.dataset.visible = 'true';
    okButton.dataset.visible = 'true';
    positionResultPanel(state.lockedRect);
    setStatus(
      normalizedText ? 'OCR complete.' : 'OCR complete, but no text was detected.',
      'Select any text in the result panel. Press OK, Esc, or Ctrl+Q to exit.'
    );
  }

  function showError(error) {
    clearCaptureRestoreTimer();
    root.style.visibility = 'visible';
    state.stage = 'result';
    root.dataset.stage = state.stage;

    const message = getFriendlyError(error);
    resultHeader.textContent = 'OCR error';
    resultText.textContent = message;
    resultPanel.dataset.visible = 'true';
    okButton.dataset.visible = 'true';
    positionResultPanel(state.lockedRect);
    setStatus('Could not recognize this region.', 'Press OK, Esc, or Ctrl+Q to exit.');
  }

  function handleRuntimeMessage(message) {
    if (!message || !state.requestId || message.requestId !== state.requestId || state.stage !== 'recognizing') {
      return undefined;
    }

    if (message.type === `${MESSAGE_PREFIX}:capture-complete`) {
      clearCaptureRestoreTimer();
      root.style.visibility = 'visible';
      setStatus('Recognizing text…', 'The first scan may take longer while the local OCR worker initializes.');
      return undefined;
    }

    if (message.type !== `${MESSAGE_PREFIX}:progress`) return undefined;

    const percentage = Number.isFinite(message.progress) ? ` ${Math.round(message.progress * 100)}%` : '';
    setStatus(`${humanizeStatus(message.status)}${percentage}`, 'OCR is running locally in the extension.');
    return undefined;
  }

  function handleKeyDown(event) {
    if (state.destroyed) return;

    const isExitShortcut = event.key === 'Escape' || (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'q');
    if (isExitShortcut) {
      event.preventDefault();
      event.stopImmediatePropagation();
      destroy();
      return;
    }

    if (state.stage === 'result' && (resultPanel.contains(event.target) || event.target === resultText)) return;

    const navigationKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
    if (navigationKeys.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function resetSelection(message) {
    state.stage = 'awaiting-first-point';
    state.firstPoint = null;
    state.lockedRect = null;
    state.requestId = null;
    root.dataset.stage = state.stage;
    setAnchor(null, false);
    setSelection(null, false);
    okButton.dataset.visible = 'false';
    resultPanel.dataset.visible = 'false';
    setStatus(message, 'Then click the bottom-right point. Esc or Ctrl+Q exits.');
  }

  function setSelection(rect, visible) {
    selection.dataset.visible = String(Boolean(visible && rect));
    if (!visible || !rect) return;

    selection.style.left = `${rect.left}px`;
    selection.style.top = `${rect.top}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
  }

  function setAnchor(point, visible) {
    anchor.dataset.visible = String(Boolean(visible && point));
    if (!visible || !point) return;

    anchor.style.left = `${point.x}px`;
    anchor.style.top = `${point.y}px`;
  }

  function setStatus(primary, secondary) {
    status.replaceChildren();
    const primaryNode = document.createTextNode(String(primary || ''));
    status.append(primaryNode);

    if (secondary) {
      const small = document.createElement('small');
      small.textContent = String(secondary);
      status.append(small);
    }
  }

  function positionResultPanel(rect) {
    if (!rect) {
      resultPanel.style.left = `${VIEWPORT_PADDING}px`;
      resultPanel.style.top = `${VIEWPORT_PADDING + 54}px`;
      return;
    }

    const maxPanelWidth = Math.min(640, window.innerWidth - VIEWPORT_PADDING * 2);
    const preferredLeft = rect.left;
    const left = clamp(preferredLeft, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, window.innerWidth - maxPanelWidth - VIEWPORT_PADDING));

    resultPanel.style.width = `${maxPanelWidth}px`;
    resultPanel.style.left = `${left}px`;
    resultPanel.style.top = '0px';
    resultPanel.style.visibility = 'hidden';

    requestAnimationFrame(() => {
      if (state.destroyed || resultPanel.dataset.visible !== 'true') return;

      const panelHeight = Math.min(resultPanel.scrollHeight, Math.min(320, window.innerHeight - VIEWPORT_PADDING * 2));
      const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
      const top = spaceBelow >= Math.min(panelHeight, 120)
        ? rect.bottom + PANEL_GAP
        : Math.max(VIEWPORT_PADDING, rect.top - PANEL_GAP - panelHeight);

      resultPanel.style.top = `${top}px`;
      resultPanel.style.visibility = 'visible';
    });
  }

  function clearCaptureRestoreTimer() {
    if (state.captureRestoreTimer) {
      window.clearTimeout(state.captureRestoreTimer);
      state.captureRestoreTimer = null;
    }
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    clearCaptureRestoreTimer();

    root.removeEventListener('pointerdown', handlePointerDown, true);
    root.removeEventListener('pointermove', handlePointerMove, true);
    root.removeEventListener('contextmenu', preventDefault, true);
    okButton.removeEventListener('click', destroy);
    resultPanel.removeEventListener('pointerdown', stopPropagation, true);
    resultPanel.removeEventListener('click', stopPropagation, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('wheel', preventScroll, true);
    window.removeEventListener('touchmove', preventScroll, true);
    chrome.runtime.onMessage.removeListener(handleRuntimeMessage);

    root.remove();
    delete window[ACTIVE_FLAG];
  }

  function normalizeRectangle(pointA, pointB) {
    const left = Math.min(pointA.x, pointB.x);
    const top = Math.min(pointA.y, pointB.y);
    const right = Math.max(pointA.x, pointB.x);
    const bottom = Math.max(pointA.y, pointB.y);

    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  }

  function clampPoint(point) {
    return {
      x: clamp(point.x, 0, window.innerWidth),
      y: clamp(point.y, 0, window.innerHeight)
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createRequestId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function normalizeRecognizedText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function humanizeStatus(value) {
    const statusValue = String(value || '').trim();
    if (!statusValue) return 'Recognizing text…';
    const sentence = statusValue.replace(/_/g, ' ');
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}…`;
  }

  function getFriendlyError(error) {
    const message = error?.message || String(error || 'Unknown OCR error');

    if (message.includes('OCR runtime assets are missing')) {
      return `${message}\n\nRun setup-ocr-assets.cmd in the extension folder, then reload the extension in chrome://extensions.`;
    }

    if (message.includes('Cannot access') || message.includes('The extensions gallery cannot be scripted')) {
      return 'Chrome cannot scan this page. Try a normal HTTP/HTTPS website.';
    }

    return message;
  }

  function waitForPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function preventDefault(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function preventScroll(event) {
    if (state.stage === 'result' && resultPanel.contains(event.target)) return;
    event.preventDefault();
  }

  function stopPropagation(event) {
    event.stopPropagation();
  }
})();
