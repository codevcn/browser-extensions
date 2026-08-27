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
    copyFeedbackTimer: null,
    recognizedText: '',
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
  status.dataset.visible = 'false';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const controls = document.createElement('div');
  controls.className = 'shortcuts-region-scan__controls';
  controls.dataset.visible = 'false';
  controls.setAttribute('aria-label', 'Scan controls');

  const resetButton = document.createElement('button');
  resetButton.className = 'shortcuts-region-scan__button shortcuts-region-scan__reset';
  resetButton.type = 'button';
  resetButton.textContent = 'Reset';
  resetButton.setAttribute('aria-label', 'Reset selection');

  const okButton = document.createElement('button');
  okButton.className = 'shortcuts-region-scan__button shortcuts-region-scan__ok';
  okButton.type = 'button';
  okButton.textContent = 'OK';
  okButton.setAttribute('aria-label', 'Close Scan Region To Text');

  controls.append(resetButton, okButton);

  const resultPanel = document.createElement('section');
  resultPanel.className = 'shortcuts-region-scan__result';
  resultPanel.dataset.visible = 'false';
  resultPanel.setAttribute('aria-label', 'Recognized text');

  const resultHeader = document.createElement('div');
  resultHeader.className = 'shortcuts-region-scan__result-header';

  const resultHeaderLabel = document.createElement('span');
  resultHeaderLabel.className = 'shortcuts-region-scan__result-label';
  resultHeaderLabel.textContent = 'Recognized text';

  const copyButton = document.createElement('button');
  copyButton.className = 'shortcuts-region-scan__copy';
  copyButton.type = 'button';
  copyButton.setAttribute('aria-label', 'Copy all recognized text');
  copyButton.title = 'Copy all recognized text (Ctrl+C)';
  setCopyButtonState('copy', false);

  resultHeader.append(resultHeaderLabel, copyButton);

  const resultText = document.createElement('pre');
  resultText.className = 'shortcuts-region-scan__result-text';
  resultText.tabIndex = 0;

  resultPanel.append(resultHeader, resultText);
  root.append(selection, anchor, status, controls, resultPanel);
  document.documentElement.append(root);

  setStatus('Click the top-left point.', 'Then click the bottom-right point to scan that rectangle.');

  root.addEventListener('pointerdown', handlePointerDown, true);
  root.addEventListener('pointermove', handlePointerMove, true);
  root.addEventListener('contextmenu', preventDefault, true);
  okButton.addEventListener('click', destroy);
  resetButton.addEventListener('click', resetSelection);
  copyButton.addEventListener('click', copyRecognizedText);
  resultPanel.addEventListener('pointerdown', stopPropagation, true);
  resultPanel.addEventListener('click', stopPropagation);
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
    if (resultPanel.contains(event.target) || controls.contains(event.target)) return;
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
      return;
    }

    if (state.stage === 'awaiting-second-point' && state.firstPoint) {
      const rect = normalizeRectangle(state.firstPoint, point);

      if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
        resetSelection();
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
    state.recognizedText = '';
    const requestId = state.requestId;
    root.dataset.stage = state.stage;

    clearCopyFeedbackTimer();
    setCopyButtonState('copy', false);
    setSelection(rect, true);
    setAnchor(null, false);
    resultPanel.dataset.visible = 'false';
    setStatusVisible(true);
    setControlsVisible(true);
    setStatus('Preparing screenshot…', 'OCR runs locally in the extension. Reset selects a new region; Esc, Ctrl+Q, or OK exits.');

    try {
      await waitForPaint();
      root.style.visibility = 'hidden';
      await waitForPaint();

      state.captureRestoreTimer = window.setTimeout(() => {
        if (!state.destroyed && state.requestId === requestId && root.style.visibility === 'hidden') {
          root.style.visibility = 'visible';
          setStatus('Recognizing text…', 'The screenshot was requested. OCR is continuing locally.');
        }
      }, 3000);

      const response = await chrome.runtime.sendMessage({
        target: 'background',
        type: `${MESSAGE_PREFIX}:recognize`,
        requestId,
        rect,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      });
      if (state.destroyed || state.requestId !== requestId || state.stage !== 'recognizing') return;

      if (!response?.ok) {
        throw new Error(response?.error || 'OCR failed.');
      }

      showResult(response.text, response.confidence);
    } catch (error) {
      if (state.destroyed || state.requestId !== requestId || state.stage !== 'recognizing') return;
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

    state.recognizedText = normalizedText;
    resultHeaderLabel.textContent = `Recognized text${confidenceText}`;
    resultText.textContent = normalizedText || 'No text detected in the selected region.';
    setCopyButtonState('copy', Boolean(normalizedText));
    resultPanel.dataset.visible = 'true';
    setStatusVisible(true);
    setControlsVisible(true);
    positionResultPanel(state.lockedRect);
    setStatus(
      normalizedText ? 'OCR complete.' : 'OCR complete, but no text was detected.',
      normalizedText
        ? 'Copy copies the full result. Ctrl+C does the same. Reset selects another region.'
        : 'Reset selects another region. Press OK, Esc, or Ctrl+Q to exit.'
    );
  }

  function showError(error) {
    clearCaptureRestoreTimer();
    root.style.visibility = 'visible';
    state.stage = 'result';
    root.dataset.stage = state.stage;

    const message = getFriendlyError(error);
    state.recognizedText = '';
    resultHeaderLabel.textContent = 'OCR error';
    resultText.textContent = message;
    setCopyButtonState('copy', false);
    resultPanel.dataset.visible = 'true';
    setStatusVisible(true);
    setControlsVisible(true);
    positionResultPanel(state.lockedRect);
    setStatus('Could not recognize this region.', 'Reset selects another region. Press OK, Esc, or Ctrl+Q to exit.');
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

    const isCopyShortcut = state.stage === 'result'
      && event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && event.key.toLowerCase() === 'c';

    if (isCopyShortcut) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void copyRecognizedText();
      return;
    }

    if (state.stage === 'result' && (resultPanel.contains(event.target) || controls.contains(event.target) || event.target === resultText)) return;

    const navigationKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
    if (navigationKeys.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function resetSelection() {
    clearCaptureRestoreTimer();
    clearCopyFeedbackTimer();

    state.stage = 'awaiting-first-point';
    state.firstPoint = null;
    state.lockedRect = null;
    state.requestId = null;
    state.recognizedText = '';
    root.dataset.stage = state.stage;
    root.style.visibility = 'visible';

    setAnchor(null, false);
    setSelection(null, false);
    setStatusVisible(false);
    setControlsVisible(false);
    resultPanel.dataset.visible = 'false';
    resultPanel.style.visibility = '';
    resultText.textContent = '';
    resultHeaderLabel.textContent = 'Recognized text';
    setCopyButtonState('copy', false);
    setStatus('Click the top-left point.', 'Then click the bottom-right point to scan that rectangle.');
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

  function setStatusVisible(visible) {
    status.dataset.visible = String(Boolean(visible));
  }

  function setControlsVisible(visible) {
    controls.dataset.visible = String(Boolean(visible));
  }

  async function copyRecognizedText() {
    if (state.destroyed || state.stage !== 'result' || !state.recognizedText) return;

    try {
      await writeTextToClipboard(state.recognizedText);
      setCopyButtonState('copied', true);
      clearCopyFeedbackTimer();
      state.copyFeedbackTimer = window.setTimeout(() => {
        state.copyFeedbackTimer = null;
        if (!state.destroyed && state.stage === 'result' && state.recognizedText) {
          setCopyButtonState('copy', true);
        }
      }, 2000);
    } catch (error) {
      console.warn('[Shortcuts Extension: Copy OCR text]', error);
      setCopyButtonState('copy', true);
      setStatus('Could not copy the recognized text.', 'Try the Copy button again, or select the text manually.');
    }
  }

  async function writeTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        console.warn('[Shortcuts Extension: Clipboard API fallback]', error);
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    root.append(textarea);

    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand('copy');
    textarea.remove();

    if (!copied) {
      throw new Error('Clipboard write was rejected.');
    }
  }

  function setCopyButtonState(mode, enabled) {
    const copied = mode === 'copied';
    copyButton.replaceChildren(createActionIcon(copied ? 'check' : 'copy'));
    copyButton.disabled = !enabled;
    copyButton.dataset.state = copied ? 'copied' : 'copy';
    copyButton.setAttribute('aria-label', copied ? 'Copied' : 'Copy all recognized text');
    copyButton.title = copied ? 'Copied' : 'Copy all recognized text (Ctrl+C)';
  }

  function createActionIcon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    if (type === 'check') {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M20 6 9 17l-5-5');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2.25');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
      return svg;
    }

    const rectBack = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectBack.setAttribute('x', '9');
    rectBack.setAttribute('y', '9');
    rectBack.setAttribute('width', '11');
    rectBack.setAttribute('height', '11');
    rectBack.setAttribute('rx', '2');
    rectBack.setAttribute('fill', 'none');
    rectBack.setAttribute('stroke', 'currentColor');
    rectBack.setAttribute('stroke-width', '2');

    const pathFront = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathFront.setAttribute('d', 'M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3');
    pathFront.setAttribute('fill', 'none');
    pathFront.setAttribute('stroke', 'currentColor');
    pathFront.setAttribute('stroke-width', '2');
    pathFront.setAttribute('stroke-linecap', 'round');
    pathFront.setAttribute('stroke-linejoin', 'round');

    svg.append(rectBack, pathFront);
    return svg;
  }

  function clearCopyFeedbackTimer() {
    if (state.copyFeedbackTimer) {
      window.clearTimeout(state.copyFeedbackTimer);
      state.copyFeedbackTimer = null;
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
    clearCopyFeedbackTimer();

    root.removeEventListener('pointerdown', handlePointerDown, true);
    root.removeEventListener('pointermove', handlePointerMove, true);
    root.removeEventListener('contextmenu', preventDefault, true);
    okButton.removeEventListener('click', destroy);
    resetButton.removeEventListener('click', resetSelection);
    copyButton.removeEventListener('click', copyRecognizedText);
    resultPanel.removeEventListener('pointerdown', stopPropagation, true);
    resultPanel.removeEventListener('click', stopPropagation);
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
