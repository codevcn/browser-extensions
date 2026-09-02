(() => {
  const ROOT_ID = 'shortcuts-annotate-screenshot-root';
  const ACTIVE_FLAG = '__SHORTCUTS_ANNOTATE_SCREENSHOT_ACTIVE__';
  const MESSAGE_PREFIX = 'shortcuts:annotate-screenshot';
  const MIN_SELECTION_SIZE = 12;
  const HISTORY_LIMIT = 30;
  const TEXT_FONT_SIZE = 14;
  const TEXT_LINE_HEIGHT = 1.25;
  const TEXT_FONT_WEIGHT = 700;
  const TEXT_FONT_FAMILY = 'Arial, sans-serif';
  const DEFAULT_STYLE = Object.freeze({
    color: '#ef4444',
    lineWidth: 4,
    textFontSize: TEXT_FONT_SIZE
  });
  const COLORS = Object.freeze([
    { name: 'Red', value: '#ef4444' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Violet', value: '#8b5cf6' }
  ]);

  if (window[ACTIVE_FLAG]) {
    window[ACTIVE_FLAG].bringToFront?.();
    return { status: 'already-active' };
  }

  const state = {
    stage: 'idle',
    area: createFullViewportArea(),
    annotations: [],
    firstPoint: null,
    pointerPoint: null,
    style: { ...DEFAULT_STYLE },
    undoStack: [],
    redoStack: [],
    textPoint: null,
    latestDataUrl: '',
    latestFilename: '',
    captureRestoreTimer: null,
    destroyed: false
  };

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.dataset.stage = state.stage;
  root.tabIndex = -1;
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'Annotate Screenshot');

  const area = document.createElement('div');
  area.className = 'shortcuts-annotate__area';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('shortcuts-annotate__drawing');
  svg.setAttribute('aria-hidden', 'true');

  const settings = createSettingsPanel();
  const help = createHelpPanel();
  const toolbar = createToolbar();
  const textEditor = createTextEditor();

  root.append(area, svg, textEditor.panel, toolbar.panel, settings.panel, help.panel);
  document.documentElement.append(root);
  root.focus({ preventScroll: true });

  root.addEventListener('pointerdown', handlePointerDown, true);
  root.addEventListener('pointermove', handlePointerMove, true);
  root.addEventListener('contextmenu', preventDefault, true);
  settings.okButton.addEventListener('click', applySettings);
  settings.panel.addEventListener('pointerdown', stopPropagation, true);
  help.closeButton.addEventListener('click', closeHelp);
  help.panel.addEventListener('pointerdown', stopPropagation, true);
  toolbar.cropButton.addEventListener('click', handleToolbarCrop);
  toolbar.arrowButton.addEventListener('click', handleToolbarArrow);
  toolbar.rectangleButton.addEventListener('click', handleToolbarRectangle);
  toolbar.textButton.addEventListener('click', handleToolbarText);
  toolbar.settingsButton.addEventListener('click', handleToolbarSettings);
  toolbar.helpButton.addEventListener('click', handleToolbarHelp);
  toolbar.panel.addEventListener('pointerdown', stopPropagation, true);
  textEditor.okButton.addEventListener('click', applyTextEditor);
  textEditor.panel.addEventListener('pointerdown', stopPropagation, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('resize', handleResize, true);
  window.addEventListener('wheel', preventScroll, { capture: true, passive: false });
  window.addEventListener('touchmove', preventScroll, { capture: true, passive: false });

  window[ACTIVE_FLAG] = {
    destroy,
    bringToFront() {
      if (root.isConnected) {
        root.style.zIndex = '2147483647';
      }
    }
  };

  render();
  return { status: 'started' };

  function handlePointerDown(event) {
    if (state.destroyed || event.button !== 0 || isPanelTarget(event.target)) return;
    if (!isSelectingStage(state.stage) && state.stage !== 'text-selecting') return;

    event.preventDefault();
    event.stopPropagation();

    const point = getClampedPointForCurrentStage({
      x: event.clientX,
      y: event.clientY
    });

    if (state.stage === 'text-selecting') {
      openTextEditor(point);
      return;
    }

    if (!state.firstPoint) {
      state.firstPoint = point;
      state.pointerPoint = point;
      render();
      return;
    }

    finishSelection(state.firstPoint, point);
  }

  function handlePointerMove(event) {
    if (state.destroyed || !isSelectingStage(state.stage) || !state.firstPoint) return;
    state.pointerPoint = getClampedPointForCurrentStage({
      x: event.clientX,
      y: event.clientY
    });
    render();
  }

  function finishSelection(start, end) {
    if (state.stage === 'crop-selecting') {
      const rect = normalizeRectangle(start, end);
      if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
        resetSelectionState();
        return;
      }

      recordHistory();
      state.area = rect;
      state.annotations = state.annotations.filter((annotation) => annotationIntersectsArea(annotation, rect));
      state.latestDataUrl = '';
      state.latestFilename = '';
      resetSelectionState();
      render();
      return;
    }

    if (distance(start, end) < MIN_SELECTION_SIZE) {
      resetSelectionState();
      return;
    }

    recordHistory();
    state.annotations.push({
      type: state.stage === 'arrow-selecting' ? 'arrow' : 'rect',
      start,
      end,
      color: state.style.color,
      lineWidth: state.style.lineWidth
    });
    state.latestDataUrl = '';
    state.latestFilename = '';
    resetSelectionState();
    render();
  }

  function handleKeyDown(event) {
    if (state.destroyed) return;

    const key = event.key.toLowerCase();
    const typingTarget = isTypingTarget(event.target);
    const textEditorTypingTarget = event.target === textEditor.input;

    if (textEditorTypingTarget) {
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        applyTextEditor();
        return;
      }

      if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.stopImmediatePropagation();
        return;
      }

      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        destroy();
        return;
      }

      return;
    }

    if (event.ctrlKey && key === 'z' && !event.shiftKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      undo();
      return;
    }

    if (event.ctrlKey && key === 'y' && !event.shiftKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      redo();
      return;
    }

    if (
      (key === 'q' || event.key === 'Escape') &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      destroy();
      return;
    }

    if (key === 's' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleSettingsShortcut();
      return;
    }

    if (event.key === '`' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resetAll();
      return;
    }

    if (key === 'h' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleHelpShortcut();
      return;
    }

    if (key === 'p' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openToolbar();
      return;
    }

    if (typingTarget) return;

    if (key === 'x' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      startSelection('crop-selecting');
      return;
    }

    if (key === 'a' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleArrowShortcut();
      return;
    }

    if (key === 'r' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleRectangleShortcut();
      return;
    }

    if (key === 't' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleTextShortcut();
      return;
    }

    if (key === 'c' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      copyAnnotatedScreenshot();
      return;
    }

    if (key === 'o' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveAnnotatedScreenshot();
      return;
    }

    if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      copyAnnotatedScreenshot({ destroyAfterCopy: true });
    }
  }

  function startSelection(stage) {
    closeToolbar();
    closeSettings();
    closeHelp();
    closeTextEditor();
    state.stage = stage;
    state.firstPoint = null;
    state.pointerPoint = null;
    state.latestDataUrl = '';
    state.latestFilename = '';
    root.dataset.stage = state.stage;
    render();
  }

  function resetSelectionState() {
    state.stage = 'idle';
    state.firstPoint = null;
    state.pointerPoint = null;
    root.dataset.stage = state.stage;
  }

  function resetAll() {
    const initialSnapshot = createInitialHistorySnapshot();
    if (!snapshotsEqual(createHistorySnapshot(), initialSnapshot)) {
      recordHistory();
    }

    closeToolbar();
    closeSettings();
    closeHelp();
    clearCaptureRestoreTimer();
    state.stage = 'idle';
    state.area = createFullViewportArea();
    state.annotations = [];
    state.firstPoint = null;
    state.pointerPoint = null;
    state.textPoint = null;
    state.style = { ...DEFAULT_STYLE };
    state.latestDataUrl = '';
    state.latestFilename = '';
    root.dataset.stage = state.stage;
    root.style.visibility = 'visible';
    closeTextEditor();
    syncSettingsInputs();
    render();
  }

  function undo() {
    if (state.stage === 'exporting') return;

    if (!state.undoStack.length) {
      cancelTransientState();
      return;
    }

    const previousSnapshot = state.undoStack.pop();
    pushHistorySnapshot(state.redoStack, createHistorySnapshot());
    restoreHistorySnapshot(previousSnapshot);
  }

  function redo() {
    if (state.stage === 'exporting' || !state.redoStack.length) return;

    const nextSnapshot = state.redoStack.pop();
    pushHistorySnapshot(state.undoStack, createHistorySnapshot());
    restoreHistorySnapshot(nextSnapshot);
  }

  function recordHistory() {
    const snapshot = createHistorySnapshot();
    const lastSnapshot = state.undoStack[state.undoStack.length - 1];
    if (lastSnapshot && snapshotsEqual(lastSnapshot, snapshot)) return;

    pushHistorySnapshot(state.undoStack, snapshot);
    state.redoStack = [];
  }

  function pushHistorySnapshot(stack, snapshot) {
    stack.push(clonePlainObject(snapshot));
    if (stack.length > HISTORY_LIMIT) {
      stack.splice(0, stack.length - HISTORY_LIMIT);
    }
  }

  function restoreHistorySnapshot(snapshot) {
    closeToolbar();
    closeSettings();
    closeHelp();
    closeTextEditor();
    clearCaptureRestoreTimer();

    state.stage = 'idle';
    state.area = clonePlainObject(snapshot.area);
    state.annotations = clonePlainObject(snapshot.annotations);
    state.style = clonePlainObject(snapshot.style);
    state.firstPoint = null;
    state.pointerPoint = null;
    state.textPoint = null;
    state.latestDataUrl = '';
    state.latestFilename = '';
    root.dataset.stage = state.stage;
    root.style.visibility = 'visible';
    syncSettingsInputs();
    render();
    root.focus({ preventScroll: true });
  }

  function cancelTransientState() {
    closeToolbar();
    closeSettings();
    closeHelp();
    closeTextEditor();
    state.stage = 'idle';
    state.firstPoint = null;
    state.pointerPoint = null;
    state.textPoint = null;
    root.dataset.stage = state.stage;
    render();
    root.focus({ preventScroll: true });
  }

  function createInitialHistorySnapshot() {
    return {
      area: createFullViewportArea(),
      annotations: [],
      style: clonePlainObject(DEFAULT_STYLE)
    };
  }

  function createHistorySnapshot() {
    return {
      area: clonePlainObject(state.area),
      annotations: clonePlainObject(state.annotations),
      style: clonePlainObject(state.style)
    };
  }

  function snapshotsEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function clonePlainObject(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function renderAnnotatedScreenshot() {
    if (state.destroyed || state.stage === 'exporting') return;

    state.stage = 'exporting';
    root.dataset.stage = state.stage;
    closeToolbar();
    closeSettings();
    closeHelp();
    closeTextEditor();

    const requestId = createRequestId();

    try {
      root.style.visibility = 'hidden';
      await waitForPaint();

      state.captureRestoreTimer = window.setTimeout(() => {
        if (!state.destroyed && state.stage === 'exporting') {
          root.style.visibility = 'visible';
        }
      }, 3000);

      const response = await chrome.runtime.sendMessage({
        target: 'background',
        type: `${MESSAGE_PREFIX}:capture`,
        requestId,
        area: state.area,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        annotations: state.annotations
      });

      if (!response?.ok || !response.dataUrl) {
        throw new Error(response?.error || 'Could not render annotated screenshot.');
      }

      state.latestDataUrl = String(response.dataUrl);
      state.latestFilename = String(response.filename || createFilename());
      root.style.visibility = 'visible';
      clearCaptureRestoreTimer();

      return {
        dataUrl: state.latestDataUrl,
        filename: state.latestFilename
      };
    } catch (error) {
      console.error('[Shortcuts Extension: Annotate Screenshot]', error);
      root.style.visibility = 'visible';
      clearCaptureRestoreTimer();
      console.warn('[Shortcuts Extension: Annotate Screenshot]', getFriendlyError(error));
      throw error;
    } finally {
      if (!state.destroyed) {
        state.stage = 'idle';
        state.firstPoint = null;
        state.pointerPoint = null;
        root.dataset.stage = state.stage;
        render();
      }
    }
  }

  async function copyAnnotatedScreenshot({ destroyAfterCopy = false } = {}) {
    try {
      const rendered = await renderAnnotatedScreenshot();
      if (!rendered?.dataUrl) return;

      await copyLatestImage();

      if (destroyAfterCopy) {
        destroy();
      }
    } catch (error) {
      console.warn('[Shortcuts Extension: Annotate Screenshot Copy]', getFriendlyError(error));
    }
  }

  async function saveAnnotatedScreenshot() {
    try {
      const rendered = await renderAnnotatedScreenshot();
      if (!rendered?.dataUrl) return;

      const response = await chrome.runtime.sendMessage({
        target: 'background',
        type: `${MESSAGE_PREFIX}:save`,
        dataUrl: rendered.dataUrl,
        filename: rendered.filename
      });

      if (!response?.ok) {
        throw new Error(response?.error || 'Chrome could not save the annotated screenshot.');
      }
    } catch (error) {
      console.warn('[Shortcuts Extension: Annotate Screenshot Save]', getFriendlyError(error));
    }
  }

  async function copyLatestImage() {
    if (!state.latestDataUrl) {
      throw new Error('No annotated screenshot has been rendered.');
    }

    try {
      const blob = await dataUrlToBlob(state.latestDataUrl);
      await copyPngBlobToClipboard(blob);
      return;
    } catch (error) {
      console.warn('[Shortcuts Extension: Clipboard API fallback]', error);
    }

    const response = await chrome.runtime.sendMessage({
      target: 'background',
      type: `${MESSAGE_PREFIX}:copy-image`,
      dataUrl: state.latestDataUrl
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Chrome could not write the annotated screenshot to the clipboard.');
    }
  }

  function toggleSettings() {
    if (settings.panel.dataset.visible === 'true') {
      closeSettings();
      return;
    }

    openSettings();
  }

  function toggleHelp() {
    if (help.panel.dataset.visible === 'true') {
      closeHelp();
      return;
    }

    openHelp();
  }

  function handleArrowShortcut() {
    startSelection('arrow-selecting');
  }

  function handleRectangleShortcut() {
    startSelection('rect-selecting');
  }

  function handleTextShortcut() {
    startSelection('text-selecting');
  }

  function handleSettingsShortcut() {
    closeToolbar();
    toggleSettings();
  }

  function handleHelpShortcut() {
    closeToolbar();
    toggleHelp();
  }

  function handleToolbarCrop() {
    closeToolbar();
    startSelection('crop-selecting');
  }

  function handleToolbarArrow() {
    closeToolbar();
    handleArrowShortcut();
  }

  function handleToolbarRectangle() {
    closeToolbar();
    handleRectangleShortcut();
  }

  function handleToolbarText() {
    closeToolbar();
    handleTextShortcut();
  }

  function handleToolbarSettings() {
    closeToolbar();
    handleSettingsShortcut();
  }

  function handleToolbarHelp() {
    closeToolbar();
    handleHelpShortcut();
  }

  function openToolbar() {
    closeSettings();
    closeHelp();
    closeTextEditor();
    state.stage = 'toolbar';
    root.dataset.stage = state.stage;
    toolbar.panel.dataset.visible = 'true';
  }

  function closeToolbar() {
    toolbar.panel.dataset.visible = 'false';
    if (state.stage === 'toolbar') {
      state.stage = 'idle';
      root.dataset.stage = state.stage;
    }
  }

  function openSettings() {
    closeToolbar();
    closeHelp();
    closeTextEditor();
    state.stage = 'settings';
    root.dataset.stage = state.stage;
    settings.panel.dataset.visible = 'true';
    syncSettingsInputs();
  }

  function closeSettings() {
    settings.panel.dataset.visible = 'false';
    if (state.stage === 'settings') {
      state.stage = 'idle';
      root.dataset.stage = state.stage;
    }
  }

  function applySettings() {
    const color = settings.getSelectedColor();
    const textFontSize = settings.getSelectedTextFontSize();
    const nextStyle = {
      color,
      lineWidth: settings.getSelectedLineWidth(),
      textFontSize
    };

    if (!snapshotsEqual(createHistorySnapshot(), {
      area: clonePlainObject(state.area),
      annotations: clonePlainObject(state.annotations),
      style: clonePlainObject(nextStyle)
    })) {
      recordHistory();
      state.style = nextStyle;
      state.latestDataUrl = '';
      state.latestFilename = '';
    }

    textEditor.input.style.color = color;
    textEditor.input.style.fontSize = `${textFontSize}px`;
    closeSettings();
    render();
  }

  function openHelp() {
    closeToolbar();
    closeSettings();
    closeTextEditor();
    state.stage = 'help';
    root.dataset.stage = state.stage;
    help.panel.dataset.visible = 'true';
  }

  function closeHelp() {
    help.panel.dataset.visible = 'false';
    if (state.stage === 'help') {
      state.stage = 'idle';
      root.dataset.stage = state.stage;
    }
  }

  function openTextEditor(point) {
    closeToolbar();
    closeSettings();
    closeHelp();
    state.stage = 'text-editing';
    state.textPoint = point;
    state.firstPoint = null;
    state.pointerPoint = null;
    state.latestDataUrl = '';
    state.latestFilename = '';
    root.dataset.stage = state.stage;
    textEditor.input.value = '';
    textEditor.input.style.color = state.style.color;
    textEditor.input.style.fontSize = `${state.style.textFontSize}px`;
    textEditor.panel.dataset.visible = 'true';
    positionTextEditor(point);
    textEditor.input.focus({ preventScroll: true });
  }

  function closeTextEditor() {
    textEditor.panel.dataset.visible = 'false';
    textEditor.input.value = '';
    state.textPoint = null;
    if (state.stage === 'text-editing') {
      state.stage = 'idle';
      root.dataset.stage = state.stage;
    }
  }

  function applyTextEditor() {
    if (state.stage !== 'text-editing' || !state.textPoint) return;

    const text = normalizeTextValue(textEditor.input.value);
    if (text) {
      recordHistory();
      state.annotations.push({
        type: 'text',
        point: state.textPoint,
        text,
        color: state.style.color,
        fontSize: state.style.textFontSize,
        lineHeight: TEXT_LINE_HEIGHT,
        fontWeight: TEXT_FONT_WEIGHT,
        fontFamily: TEXT_FONT_FAMILY
      });
      state.latestDataUrl = '';
      state.latestFilename = '';
    }

    closeTextEditor();
    render();
    root.focus({ preventScroll: true });
  }

  function positionTextEditor(point) {
    const viewportPadding = 12;
    const editorHeight = 74;
    const panelWidth = Math.min(420, window.innerWidth - viewportPadding * 2);
    const left = clamp(point.x, viewportPadding, Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding));
    const bottom = clamp(window.innerHeight - point.y, viewportPadding, Math.max(viewportPadding, window.innerHeight - editorHeight - viewportPadding));

    textEditor.panel.style.width = `${panelWidth}px`;
    textEditor.panel.style.left = `${left}px`;
    textEditor.panel.style.bottom = `${bottom}px`;
  }

  function syncSettingsInputs() {
    const colorInput = settings.panel.querySelector(`input[name="shortcuts-annotate-color"][value="${state.style.color}"]`);
    if (colorInput) colorInput.checked = true;
    settings.thicknessRange.value = String(state.style.lineWidth);
    settings.thicknessNumber.value = String(state.style.lineWidth);
    settings.fontSizeRange.value = String(state.style.textFontSize);
    settings.fontSizeNumber.value = String(state.style.textFontSize);
  }

  function render() {
    renderArea();
    renderAnnotations();
  }

  function renderArea() {
    area.dataset.visible = 'true';
    area.style.left = `${state.area.left}px`;
    area.style.top = `${state.area.top}px`;
    area.style.width = `${state.area.width}px`;
    area.style.height = `${state.area.height}px`;
  }

  function renderAnnotations() {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);

    state.annotations.forEach((annotation) => {
      appendAnnotation(annotation, false);
    });

    if (isSelectingStage(state.stage) && state.firstPoint && state.pointerPoint) {
      if (state.stage === 'crop-selecting') {
        appendSelectionRectangle(normalizeRectangle(state.firstPoint, state.pointerPoint), true, DEFAULT_STYLE.color, 2);
      } else {
        appendAnnotation({
          type: state.stage === 'arrow-selecting' ? 'arrow' : 'rect',
          start: state.firstPoint,
          end: state.pointerPoint,
          color: state.style.color,
          lineWidth: state.style.lineWidth
        }, true);
      }
    }
  }

  function appendAnnotation(annotation, draft) {
    if (annotation.type === 'text') {
      appendText(annotation, draft);
      return;
    }

    if (annotation.type === 'arrow') {
      appendArrow(annotation, draft);
      return;
    }

    appendSelectionRectangle(normalizeRectangle(annotation.start, annotation.end), draft, annotation.color, annotation.lineWidth);
  }

  function appendText(annotation, draft) {
    const lines = splitTextLines(annotation.text);
    if (!lines.length) return;

    const textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textNode.dataset.draft = String(Boolean(draft));
    textNode.setAttribute('x', annotation.point.x);
    textNode.setAttribute('y', getTextFirstLineY(annotation, lines.length));
    textNode.setAttribute('fill', annotation.color);
    textNode.setAttribute('font-size', annotation.fontSize || TEXT_FONT_SIZE);
    textNode.setAttribute('font-family', annotation.fontFamily || TEXT_FONT_FAMILY);
    textNode.setAttribute('font-weight', annotation.fontWeight || TEXT_FONT_WEIGHT);
    textNode.setAttribute('dominant-baseline', 'alphabetic');

    lines.forEach((line, index) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', annotation.point.x);
      if (index > 0) {
        tspan.setAttribute('dy', `${getTextLineHeight(annotation)}px`);
      }
      tspan.textContent = line;
      textNode.append(tspan);
    });

    svg.append(textNode);
  }

  function appendArrow(annotation, draft) {
    const deltaX = annotation.end.x - annotation.start.x;
    const deltaY = annotation.end.y - annotation.start.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length < 1) return;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.draft = String(Boolean(draft));

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', annotation.start.x);
    line.setAttribute('y1', annotation.start.y);
    const head = createArrowHead(annotation.start, annotation.end, annotation.lineWidth);
    line.setAttribute('x2', head.baseCenter.x);
    line.setAttribute('y2', head.baseCenter.y);
    line.setAttribute('stroke', annotation.color);
    line.setAttribute('stroke-width', annotation.lineWidth);
    line.setAttribute('stroke-linecap', 'round');

    head.node.setAttribute('fill', annotation.color);

    group.append(line, head.node);
    svg.append(group);
  }

  function createArrowHead(start, end, lineWidth) {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length < 1) {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      return {
        node: polygon,
        baseCenter: { ...end }
      };
    }

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
    const points = [
      [end.x, end.y],
      [
        baseCenter.x + perpendicularX * (headWidth / 2),
        baseCenter.y + perpendicularY * (headWidth / 2)
      ],
      [
        baseCenter.x - perpendicularX * (headWidth / 2),
        baseCenter.y - perpendicularY * (headWidth / 2)
      ]
    ];

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points.map((point) => point.join(',')).join(' '));
    return {
      node: polygon,
      baseCenter
    };
  }

  function appendSelectionRectangle(rect, draft, color, lineWidth) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    node.dataset.draft = String(Boolean(draft));
    node.setAttribute('x', rect.left);
    node.setAttribute('y', rect.top);
    node.setAttribute('width', rect.width);
    node.setAttribute('height', rect.height);
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', color);
    node.setAttribute('stroke-width', lineWidth);
    node.setAttribute('stroke-linejoin', 'round');
    svg.append(node);
  }

  function createSettingsPanel() {
    const panelNode = document.createElement('section');
    panelNode.className = 'shortcuts-annotate__settings';
    panelNode.dataset.visible = 'false';
    panelNode.setAttribute('aria-label', 'Annotation settings');

    const title = document.createElement('strong');
    title.textContent = 'Settings';

    const colorGrid = document.createElement('div');
    colorGrid.className = 'shortcuts-annotate__colors';

    COLORS.forEach((color) => {
      const label = document.createElement('label');
      label.className = 'shortcuts-annotate__color';
      label.title = color.name;

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'shortcuts-annotate-color';
      input.value = color.value;

      const swatch = document.createElement('span');
      swatch.style.backgroundColor = color.value;
      swatch.textContent = color.name.slice(0, 1);

      label.append(input, swatch);
      colorGrid.append(label);
    });

    const thicknessRow = document.createElement('label');
    thicknessRow.className = 'shortcuts-annotate__thickness';

    const thicknessText = document.createElement('span');
    thicknessText.textContent = 'Thickness';

    const thicknessRange = document.createElement('input');
    thicknessRange.type = 'range';
    thicknessRange.min = '1';
    thicknessRange.max = '50';
    thicknessRange.step = '1';

    const thicknessNumber = document.createElement('input');
    thicknessNumber.type = 'number';
    thicknessNumber.min = '1';
    thicknessNumber.max = '50';
    thicknessNumber.step = '1';

    thicknessRange.addEventListener('input', () => {
      thicknessNumber.value = thicknessRange.value;
    });

    thicknessNumber.addEventListener('input', () => {
      thicknessRange.value = String(clamp(Number(thicknessNumber.value) || 1, 1, 50));
    });

    thicknessRow.append(thicknessText, thicknessRange, thicknessNumber);

    const fontSizeRow = document.createElement('label');
    fontSizeRow.className = 'shortcuts-annotate__font-size';

    const fontSizeText = document.createElement('span');
    fontSizeText.textContent = 'Font size';

    const fontSizeRange = document.createElement('input');
    fontSizeRange.type = 'range';
    fontSizeRange.min = '6';
    fontSizeRange.max = '96';
    fontSizeRange.step = '1';

    const fontSizeNumber = document.createElement('input');
    fontSizeNumber.type = 'number';
    fontSizeNumber.min = '6';
    fontSizeNumber.max = '96';
    fontSizeNumber.step = '1';

    fontSizeRange.addEventListener('input', () => {
      fontSizeNumber.value = fontSizeRange.value;
    });

    fontSizeNumber.addEventListener('input', () => {
      fontSizeRange.value = String(clamp(Number(fontSizeNumber.value) || DEFAULT_STYLE.textFontSize, 6, 96));
    });

    fontSizeRow.append(fontSizeText, fontSizeRange, fontSizeNumber);

    const okButton = createButton('OK', 'Apply annotation settings');
    okButton.classList.add('shortcuts-annotate__ok');

    panelNode.append(title, colorGrid, thicknessRow, fontSizeRow, okButton);

    return {
      panel: panelNode,
      okButton,
      thicknessRange,
      thicknessNumber,
      fontSizeRange,
      fontSizeNumber,
      getSelectedColor() {
        const checked = panelNode.querySelector('input[name="shortcuts-annotate-color"]:checked');
        return checked?.value || DEFAULT_STYLE.color;
      },
      getSelectedLineWidth() {
        return clamp(Number(thicknessNumber.value) || DEFAULT_STYLE.lineWidth, 1, 50);
      },
      getSelectedTextFontSize() {
        return clamp(Number(fontSizeNumber.value) || DEFAULT_STYLE.textFontSize, 6, 96);
      }
    };
  }

  function createHelpPanel() {
    const panelNode = document.createElement('section');
    panelNode.className = 'shortcuts-annotate__help';
    panelNode.dataset.visible = 'false';
    panelNode.setAttribute('aria-label', 'Annotate Screenshot shortcuts');

    const title = document.createElement('strong');
    title.textContent = 'Shortcuts';

    const list = document.createElement('dl');
    list.className = 'shortcuts-annotate__shortcut-list';

    [
      ['x', 'Crop screenshot area with two points'],
      ['a', 'Draw an arrow with two points'],
      ['r', 'Draw a rectangle border with two points'],
      ['t', 'Add text at one point inside the screenshot area'],
      ['s', 'Open or close annotation settings'],
      ['`', 'Reset to the initial full-viewport overlay'],
      ['p', 'Open the annotation toolbar'],
      ['h', 'Open or close this shortcuts popup'],
      ['Ctrl+Z', 'Undo the latest annotation change'],
      ['Ctrl+Y', 'Redo the latest undone annotation change'],
      ['c', 'Copy the screenshot area to clipboard'],
      ['o', 'Open the save dialog for the screenshot PNG'],
      ['Enter', 'Copy the screenshot area to clipboard and exit'],
      ['q', 'Exit Annotate Screenshot'],
      ['Esc', 'Exit Annotate Screenshot']
    ].forEach(([keyLabel, description]) => {
      const term = document.createElement('dt');
      const keyNode = document.createElement('kbd');
      keyNode.textContent = keyLabel;
      term.append(keyNode);

      const detail = document.createElement('dd');
      detail.textContent = description;

      list.append(term, detail);
    });

    const closeButton = createButton('Close', 'Close shortcuts popup');
    closeButton.classList.add('shortcuts-annotate__help-close');

    panelNode.append(title, list, closeButton);

    return {
      panel: panelNode,
      closeButton
    };
  }

  function createToolbar() {
    const panelNode = document.createElement('div');
    panelNode.className = 'shortcuts-annotate__toolbar';
    panelNode.dataset.visible = 'false';
    panelNode.setAttribute('role', 'toolbar');
    panelNode.setAttribute('aria-label', 'Annotation toolbar');

    const cropButton = createButton('Crop', 'Crop screenshot area');
    const arrowButton = createButton('Arrow', 'Draw arrow');
    const rectangleButton = createButton('Rectangle', 'Draw rectangle border');
    const textButton = createButton('Text', 'Add text annotation');
    const settingsButton = createButton('Settings', 'Open annotation settings');
    const helpButton = createButton('Help', 'Open annotation shortcuts help');

    panelNode.append(cropButton, arrowButton, rectangleButton, textButton, settingsButton, helpButton);

    return {
      panel: panelNode,
      cropButton,
      arrowButton,
      rectangleButton,
      textButton,
      settingsButton,
      helpButton
    };
  }

  function createTextEditor() {
    const panelNode = document.createElement('div');
    panelNode.className = 'shortcuts-annotate__text-editor';
    panelNode.dataset.visible = 'false';
    panelNode.setAttribute('aria-label', 'Text annotation editor');

    const input = document.createElement('textarea');
    input.className = 'shortcuts-annotate__text-input';
    input.rows = 2;
    input.placeholder = 'Text';
    input.setAttribute('aria-label', 'Text annotation');

    const okButton = createButton('OK', 'Apply text annotation');
    okButton.classList.add('shortcuts-annotate__text-ok');

    panelNode.append(input, okButton);

    return {
      panel: panelNode,
      input,
      okButton
    };
  }

  function createButton(text, ariaLabel) {
    const button = document.createElement('button');
    button.className = 'shortcuts-annotate__button';
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', ariaLabel);
    return button;
  }

  function isPanelTarget(target) {
    return textEditor.panel.contains(target) ||
      toolbar.panel.contains(target) ||
      settings.panel.contains(target) ||
      help.panel.contains(target);
  }

  function isSelectingStage(stage) {
    return stage === 'crop-selecting' || stage === 'arrow-selecting' || stage === 'rect-selecting';
  }

  function getClampedPointForCurrentStage(point) {
    if (state.stage === 'crop-selecting') {
      return clampPoint(point, createFullViewportArea());
    }

    return clampPoint(point, state.area);
  }

  function createFullViewportArea() {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight
    };
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

  function clampPoint(point, bounds) {
    return {
      x: clamp(point.x, bounds.left, bounds.right),
      y: clamp(point.y, bounds.top, bounds.bottom)
    };
  }

  function annotationIntersectsArea(annotation, rect) {
    if (annotation.type === 'text') {
      return annotation.point.x >= rect.left &&
        annotation.point.x <= rect.right &&
        annotation.point.y >= rect.top &&
        annotation.point.y <= rect.bottom;
    }

    const annotationRect = normalizeRectangle(annotation.start, annotation.end);
    return !(
      annotationRect.right < rect.left ||
      annotationRect.left > rect.right ||
      annotationRect.bottom < rect.top ||
      annotationRect.top > rect.bottom
    );
  }

  function distance(pointA, pointB) {
    return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
  }

  function handleResize() {
    const fullViewportArea = createFullViewportArea();
    const maxLeft = Math.max(0, fullViewportArea.right - MIN_SELECTION_SIZE);
    const maxTop = Math.max(0, fullViewportArea.bottom - MIN_SELECTION_SIZE);
    const left = clamp(state.area.left, 0, maxLeft);
    const top = clamp(state.area.top, 0, maxTop);
    const right = clamp(state.area.right, left + MIN_SELECTION_SIZE, fullViewportArea.right);
    const bottom = clamp(state.area.bottom, top + MIN_SELECTION_SIZE, fullViewportArea.bottom);

    state.area = {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
    if (state.stage === 'text-editing' && state.textPoint) {
      state.textPoint = clampPoint(state.textPoint, state.area);
      positionTextEditor(state.textPoint);
    }
    render();
  }

  function normalizeTextValue(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function splitTextLines(value) {
    return normalizeTextValue(value).split('\n').filter((line) => line.length > 0);
  }

  function getTextLineHeight(annotation) {
    return (annotation.fontSize || TEXT_FONT_SIZE) * (annotation.lineHeight || TEXT_LINE_HEIGHT);
  }

  function getTextFirstLineY(annotation, lineCount) {
    return annotation.point.y - (Math.max(1, lineCount) - 1) * getTextLineHeight(annotation);
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  async function copyPngBlobToClipboard(blob) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Image clipboard write is not available in this browser.');
    }

    const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });

    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': pngBlob
      })
    ]);
  }

  function createFilename() {
    return `annotated-screenshot-${formatTimestamp(new Date())}.png`;
  }

  function formatTimestamp(date) {
    const pad = (value) => String(value).padStart(2, '0');

    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-') +
      '-' +
      [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-');
  }

  function createRequestId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `annotate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function getFriendlyError(error) {
    const message = error?.message || String(error || 'Unknown annotated screenshot error');

    if (message.includes('Cannot access') || message.includes('extensions gallery')) {
      return 'Chrome cannot capture this page. Try a normal HTTP/HTTPS website.';
    }

    if (message.includes('clipboard') || message.includes('Clipboard')) {
      return 'Chrome could not write the image to the clipboard.';
    }

    if (message.includes('downloads') || message.includes('Download')) {
      return 'Chrome could not create the download. Check the extension permissions.';
    }

    return message;
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
    settings.okButton.removeEventListener('click', applySettings);
    settings.panel.removeEventListener('pointerdown', stopPropagation, true);
    help.closeButton.removeEventListener('click', closeHelp);
    help.panel.removeEventListener('pointerdown', stopPropagation, true);
    toolbar.cropButton.removeEventListener('click', handleToolbarCrop);
    toolbar.arrowButton.removeEventListener('click', handleToolbarArrow);
    toolbar.rectangleButton.removeEventListener('click', handleToolbarRectangle);
    toolbar.textButton.removeEventListener('click', handleToolbarText);
    toolbar.settingsButton.removeEventListener('click', handleToolbarSettings);
    toolbar.helpButton.removeEventListener('click', handleToolbarHelp);
    toolbar.panel.removeEventListener('pointerdown', stopPropagation, true);
    textEditor.okButton.removeEventListener('click', applyTextEditor);
    textEditor.panel.removeEventListener('pointerdown', stopPropagation, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('resize', handleResize, true);
    window.removeEventListener('wheel', preventScroll, true);
    window.removeEventListener('touchmove', preventScroll, true);

    root.remove();
    delete window[ACTIVE_FLAG];
  }

  function isTypingTarget(target) {
    return target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;
  }

  function waitForPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function preventDefault(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function preventScroll(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function stopPropagation(event) {
    event.stopPropagation();
  }
})();
