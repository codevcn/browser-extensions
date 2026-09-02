const MESSAGE_STATES = Object.freeze({
  success: { icon: '✓', role: 'status' },
  error: { icon: '!', role: 'alert' },
  warning: { icon: '!', role: 'status' },
  info: { icon: 'i', role: 'status' }
});

const VIEW_CONFIG = Object.freeze({
  home: {
    title: 'Shortcuts Extension',
    subtitle: 'Run browser utilities with buttons or keyboard shortcuts.'
  },
  'copy-urls': {
    title: 'Copy URLs by Domain',
    subtitle: 'Collect matching URLs from every open browser tab.'
  },
  'download-files': {
    title: 'Download Files by Domain',
    subtitle: 'Fetch matching tab URLs, detect files, then save them to a folder.'
  }
});

const pageScreenshotBtn = document.getElementById('pageScreenshotBtn');
const annotateScreenshotBtn = document.getElementById('annotateScreenshotBtn');
const copyUrlsViewBtn = document.getElementById('copyUrlsViewBtn');
const downloadFilesViewBtn = document.getElementById('downloadFilesViewBtn');
const scanRegionTextBtn = document.getElementById('scanRegionTextBtn');
const saveScreenshotBtn = document.getElementById('saveScreenshotBtn');
const closePopupBtn = document.getElementById('closePopupBtn');

const copyUrlsForm = document.getElementById('copyUrlsForm');
const copyDomainInput = document.getElementById('copyDomainInput');
const removeQueryCheckbox = document.getElementById('removeQueryCheckbox');
const copyUrlsSubmitBtn = document.getElementById('copyUrlsSubmitBtn');

const downloadFilesForm = document.getElementById('downloadFilesForm');
const downloadDomainInput = document.getElementById('downloadDomainInput');
const downloadFilesSubmitBtn = document.getElementById('downloadFilesSubmitBtn');
const preparedFilesPanel = document.getElementById('preparedFilesPanel');
const preparedFilesCount = document.getElementById('preparedFilesCount');
const preparedFilesSize = document.getElementById('preparedFilesSize');
const preparedFilesList = document.getElementById('preparedFilesList');
const savePreparedFilesBtn = document.getElementById('savePreparedFilesBtn');

const popupShell = document.querySelector('.popup-shell');
const homeView = document.getElementById('homeView');
const extensionVersion = document.getElementById('extensionVersion');
const viewTitle = document.getElementById('viewTitle');
const viewSubtitle = document.getElementById('viewSubtitle');
const views = Array.from(document.querySelectorAll('[data-view]'));
const backHomeButtons = Array.from(document.querySelectorAll('[data-back-home]'));

const messageBar = document.getElementById('messageBar');
const messageIcon = document.getElementById('messageIcon');
const messageText = document.getElementById('messageText');

let currentView = 'home';
let lastScreenshot = null;
let preparedFiles = [];
let isCapturing = false;
let isSavingScreenshot = false;
let isCopyingUrls = false;
let isPreparingFiles = false;
let isWritingFiles = false;
let isStartingAnnotation = false;
let isStartingRegionScan = false;
let messageBarResizeObserver = null;

pageScreenshotBtn.addEventListener('click', handlePageScreenshot);
annotateScreenshotBtn.addEventListener('click', handleAnnotateScreenshot);
copyUrlsViewBtn.addEventListener('click', () => openView('copy-urls'));
downloadFilesViewBtn.addEventListener('click', () => openView('download-files'));
scanRegionTextBtn.addEventListener('click', handleScanRegionToText);
saveScreenshotBtn.addEventListener('click', handleSaveScreenshot);
closePopupBtn.addEventListener('click', closePopup);

copyUrlsForm.addEventListener('submit', handleCopyUrlsSubmit);
downloadFilesForm.addEventListener('submit', handleDownloadFilesSubmit);
savePreparedFilesBtn.addEventListener('click', handleSavePreparedFiles);
backHomeButtons.forEach((button) => button.addEventListener('click', openHomeView));

document.addEventListener('keydown', handleGlobalShortcut, true);

setSaveScreenshotButtonEnabled(false);
setExtensionVersion();
initializeMessageBarLayout();
setMessage('Ready.', 'info');

function initializeMessageBarLayout() {
  popupShell.dataset.currentView = currentView;

  if (typeof ResizeObserver === 'function') {
    messageBarResizeObserver = new ResizeObserver(() => {
      updateHomeMessageReservedSpace();
    });
    messageBarResizeObserver.observe(messageBar);
  }

  updateHomeMessageReservedSpace();
}

function updateHomeMessageReservedSpace() {
  if (currentView !== 'home') {
    popupShell.style.removeProperty('--home-message-reserved-space');
    return;
  }

  const messageHeight = Math.ceil(messageBar.getBoundingClientRect().height);
  const reservedSpace = Math.max(68, messageHeight + 14);
  popupShell.style.setProperty('--home-message-reserved-space', `${reservedSpace}px`);
}

function handleGlobalShortcut(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

  const target = event.target;
  const isTypingTarget =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable;

  if (isTypingTarget) return;

  const key = event.key.toLowerCase();

  if (currentView !== 'home') {
    if (key === 'q') {
      event.preventDefault();
      event.stopPropagation();
      openHomeView();
    }
    return;
  }

  const shortcutActions = {
    '1': handlePageScreenshot,
    '2': handleAnnotateScreenshot,
    '3': () => openView('copy-urls'),
    '4': () => openView('download-files'),
    '9': handleScanRegionToText,
    s: handleSaveScreenshot,
    q: closePopup
  };

  const action = shortcutActions[key];
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();
  action();
}

function openView(viewName) {
  const config = VIEW_CONFIG[viewName];
  if (!config) return;

  currentView = viewName;
  popupShell.dataset.currentView = viewName;
  updateHomeMessageReservedSpace();
  viewTitle.textContent = config.title;
  viewSubtitle.textContent = config.subtitle;

  views.forEach((view) => {
    view.hidden = view.dataset.view !== viewName;
  });

  if (viewName === 'copy-urls') {
    setMessage('Enter a domain, then press Enter to copy matching tab URLs.', 'info');
    requestAnimationFrame(() => copyDomainInput.focus());
    return;
  }

  if (viewName === 'download-files') {
    setMessage('Enter a domain, then press Enter to scan matching tabs.', 'info');
    requestAnimationFrame(() => downloadDomainInput.focus());
  }
}

function openHomeView() {
  openView('home');
  setMessage('Ready.', 'info');
}

async function handleAnnotateScreenshot() {
  if (isStartingAnnotation) return;

  setStartingAnnotation(true);
  setMessage('Starting Annotate Screenshot...', 'info');

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!Number.isInteger(activeTab?.id)) {
      throw new Error('No active browser tab is available.');
    }

    if (!isScriptableTabUrl(activeTab.url)) {
      throw new Error('Chrome cannot run Annotate Screenshot on this page. Open a normal HTTP/HTTPS website and try again.');
    }

    await chrome.scripting.insertCSS({
      target: { tabId: activeTab.id },
      files: ['annotate-screenshot/annotate-screenshot.css']
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['annotate-screenshot/annotate-screenshot.js']
    });

    const status = results?.[0]?.result?.status;
    setMessage(status === 'already-active' ? 'Annotate Screenshot is already active on this tab.' : 'Annotate Screenshot started.', 'success');

    window.setTimeout(closePopup, 80);
  } catch (error) {
    console.error('[Shortcuts Extension: Annotate Screenshot]', error);
    setMessage(getFriendlyError(error), 'error');
  } finally {
    setStartingAnnotation(false);
  }
}

async function handleScanRegionToText() {
  if (isStartingRegionScan) return;

  setStartingRegionScan(true);
  setMessage('Starting Scan Region To Text…', 'info');

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!Number.isInteger(activeTab?.id)) {
      throw new Error('No active browser tab is available.');
    }

    if (!isScriptableTabUrl(activeTab.url)) {
      throw new Error('Chrome cannot run Scan Region To Text on this page. Open a normal HTTP/HTTPS website and try again.');
    }

    await chrome.scripting.insertCSS({
      target: { tabId: activeTab.id },
      files: ['region-scan/region-scan.css']
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['region-scan/region-scan.js']
    });

    const status = results?.[0]?.result?.status;
    setMessage(status === 'already-active' ? 'Region scanner is already active on this tab.' : 'Region scanner started.', 'success');

    window.setTimeout(closePopup, 80);
  } catch (error) {
    console.error('[Shortcuts Extension: Scan Region To Text]', error);
    setMessage(getFriendlyError(error), 'error');
  } finally {
    setStartingRegionScan(false);
  }
}

function isScriptableTabUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function setExtensionVersion() {
  const version = chrome.runtime.getManifest()?.version;
  extensionVersion.textContent = version ? `· v${version}` : '';
}

async function handlePageScreenshot() {
  if (isCapturing) return;

  setCapturing(true);
  setMessage('Capturing the visible viewport…', 'info');

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
      format: 'png'
    });

    const blob = await dataUrlToBlob(dataUrl);
    await copyPngBlobToClipboard(blob);

    lastScreenshot = {
      dataUrl,
      blob,
      filename: createScreenshotFilename()
    };

    setSaveScreenshotButtonEnabled(true);
    setMessage('Screenshot copied to the clipboard. You can save it with S.', 'success');
  } catch (error) {
    console.error('[Shortcuts Extension: Screenshot]', error);
    setMessage(getFriendlyError(error), 'error');
  } finally {
    setCapturing(false);
  }
}

async function handleSaveScreenshot() {
  if (isSavingScreenshot) return;

  if (!lastScreenshot?.dataUrl) {
    setSaveScreenshotButtonEnabled(false);
    setMessage('No screenshot has been captured in this popup session.', 'warning');
    return;
  }

  setSavingScreenshot(true);
  setMessage('Opening the Save As dialog…', 'info');

  try {
    await chrome.downloads.download({
      url: lastScreenshot.dataUrl,
      filename: lastScreenshot.filename,
      saveAs: true
    });

    setMessage(`Save request created for ${lastScreenshot.filename}.`, 'success');
  } catch (error) {
    console.error('[Shortcuts Extension: Save Screenshot]', error);
    setMessage(getFriendlyError(error), 'error');
  } finally {
    setSavingScreenshot(false);
  }
}

async function handleCopyUrlsSubmit(event) {
  event.preventDefault();
  if (isCopyingUrls) return;

  let domain;

  try {
    domain = normalizeDomainInput(copyDomainInput.value);
  } catch (error) {
    setMessage(error.message, 'error');
    copyDomainInput.focus();
    return;
  }

  setCopyingUrls(true);
  setMessage(`Searching open tabs for ${domain}…`, 'info');

  try {
    const matchingTabs = await getMatchingHttpTabs(domain);

    if (matchingTabs.length === 0) {
      setMessage(`No open HTTP/HTTPS tabs match ${domain}.`, 'warning');
      return;
    }

    const urls = matchingTabs.map((tab) => {
      return removeQueryCheckbox.checked ? removeQueryString(tab.url) : tab.url;
    });

    const clipboardText = formatUrlsForClipboard(urls);
    await copyTextToClipboard(clipboardText);

    const queryMessage = removeQueryCheckbox.checked ? ' Query strings were removed.' : '';
    setMessage(`Copied ${urls.length} matching URL${urls.length === 1 ? '' : 's'}.${queryMessage}`, 'success');
  } catch (error) {
    console.error('[Shortcuts Extension: Copy URLs]', error);
    setMessage(getFriendlyError(error), 'error');
  } finally {
    setCopyingUrls(false);
  }
}

async function handleDownloadFilesSubmit(event) {
  event.preventDefault();
  if (isPreparingFiles || isWritingFiles) return;

  let domain;

  try {
    domain = normalizeDomainInput(downloadDomainInput.value);
  } catch (error) {
    setMessage(error.message, 'error');
    downloadDomainInput.focus();
    return;
  }

  clearPreparedFiles();
  setPreparingFiles(true);
  setMessage(`Searching open tabs for ${domain}…`, 'info');

  try {
    const matchingTabs = await getMatchingHttpTabs(domain);

    if (matchingTabs.length === 0) {
      setMessage(`No open HTTP/HTTPS tabs match ${domain}.`, 'warning');
      return;
    }

    let clipboardCopied = true;
    try {
      await copyTextToClipboard(formatUrlsForClipboard(matchingTabs.map((tab) => tab.url)));
    } catch (clipboardError) {
      clipboardCopied = false;
      console.warn('[Shortcuts Extension: Download URLs Clipboard]', clipboardError);
    }

    let completedCount = 0;
    const results = await mapWithConcurrency(matchingTabs, 4, async (tab, index) => {
      const result = await fetchTabFileCandidate(tab, index);
      completedCount += 1;
      setMessage(`Fetched ${completedCount}/${matchingTabs.length} matching URL${matchingTabs.length === 1 ? '' : 's'}…`, 'info');
      return result;
    });

    const files = [];
    const failures = [];
    let skippedPageCount = 0;

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.isFile) {
          files.push(result.value.file);
        } else {
          skippedPageCount += 1;
        }
      } else {
        failures.push(result.reason);
      }
    });

    preparedFiles = assignUniqueFilenames(files);
    renderPreparedFiles();

    if (preparedFiles.length === 0) {
      const details = [
        skippedPageCount > 0 ? `${skippedPageCount} normal page${skippedPageCount === 1 ? '' : 's'} skipped` : '',
        failures.length > 0 ? `${failures.length} request${failures.length === 1 ? '' : 's'} failed` : ''
      ].filter(Boolean).join('; ');

      setMessage(`No downloadable file responses were detected${details ? ` (${details})` : ''}.`, failures.length ? 'warning' : 'info');
      return;
    }

    const notes = [];
    if (skippedPageCount > 0) notes.push(`${skippedPageCount} normal page${skippedPageCount === 1 ? '' : 's'} skipped`);
    if (failures.length > 0) notes.push(`${failures.length} request${failures.length === 1 ? '' : 's'} failed`);
    if (!clipboardCopied) notes.push('URL clipboard copy failed');

    const suffix = notes.length > 0 ? ` ${notes.join('; ')}.` : '';
    const state = failures.length > 0 || !clipboardCopied ? 'warning' : 'success';

    setMessage(
      `${preparedFiles.length} file${preparedFiles.length === 1 ? '' : 's'} ready (${formatBytes(getPreparedFilesTotalSize())}). Click “Choose folder & save”.${suffix}`,
      state
    );
  } catch (error) {
    console.error('[Shortcuts Extension: Prepare Files]', error);
    setMessage(getFriendlyError(error), 'error');
  } finally {
    setPreparingFiles(false);
  }
}

async function handleSavePreparedFiles() {
  if (isWritingFiles) return;

  if (preparedFiles.length === 0) {
    setMessage('No prepared files are available. Scan the matching tabs first.', 'warning');
    return;
  }

  if (typeof window.showDirectoryPicker !== 'function') {
    setMessage('Folder selection is not supported in this Chrome version.', 'error');
    return;
  }

  let directoryHandle;

  try {
    // This call intentionally happens immediately inside the click handler.
    directoryHandle = await window.showDirectoryPicker({
      id: 'shortcut-downloads',
      mode: 'readwrite'
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      setMessage('Folder selection was cancelled. No files were saved.', 'warning');
      return;
    }

    console.error('[Shortcuts Extension: Choose Folder]', error);
    setMessage(getFriendlyError(error), 'error');
    return;
  }

  setWritingFiles(true);
  let savedCount = 0;
  const failures = [];

  try {
    for (const file of preparedFiles) {
      setMessage(`Saving ${savedCount + 1}/${preparedFiles.length}: ${file.filename}`, 'info');

      try {
        const fileHandle = await directoryHandle.getFileHandle(file.filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file.blob);
        await writable.close();
        savedCount += 1;
      } catch (error) {
        console.error(`[Shortcuts Extension: Save File] ${file.filename}`, error);
        failures.push({ file, error });
      }
    }

    if (failures.length === 0) {
      setMessage(`Saved ${savedCount} file${savedCount === 1 ? '' : 's'} successfully.`, 'success');
      return;
    }

    setMessage(
      `Saved ${savedCount}/${preparedFiles.length} files. ${failures.length} file${failures.length === 1 ? '' : 's'} could not be written.`,
      savedCount > 0 ? 'warning' : 'error'
    );
  } finally {
    setWritingFiles(false);
  }
}

async function getMatchingHttpTabs(domain) {
  const tabs = await chrome.tabs.query({});

  return tabs.filter((tab) => {
    if (!tab.url) return false;

    try {
      const url = new URL(tab.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      return hostnameMatchesDomain(url.hostname, domain);
    } catch {
      return false;
    }
  });
}

async function fetchTabFileCandidate(tab, index) {
  const response = await fetch(tab.url, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${tab.url}`);
  }

  const blob = await response.blob();
  const contentType = normalizeMimeType(response.headers.get('content-type') || blob.type);
  const contentDisposition = response.headers.get('content-disposition') || '';
  const url = new URL(response.url || tab.url);
  const filename = createDownloadFilename({
    contentDisposition,
    contentType,
    url,
    tabTitle: tab.title,
    fallbackIndex: index + 1
  });

  const classification = classifyFileResponse({
    contentDisposition,
    contentType,
    pathname: url.pathname,
    filename
  });

  return {
    isFile: classification.isFile,
    file: classification.isFile
      ? {
          blob,
          filename,
          sourceUrl: tab.url,
          resolvedUrl: response.url || tab.url,
          contentType: contentType || 'application/octet-stream',
          category: classification.category,
          size: blob.size
        }
      : null
  };
}

function classifyFileResponse({ contentDisposition, contentType, pathname, filename }) {
  const disposition = contentDisposition.toLowerCase();
  const extension = getFileExtension(filename || pathname);
  const isAttachment = disposition.includes('attachment');

  if (isAttachment) {
    return { isFile: true, category: getFileCategory(contentType, extension) };
  }

  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
    return { isFile: false, category: 'page' };
  }

  if (/^(image|video|audio|font|model)\//.test(contentType)) {
    return { isFile: true, category: getFileCategory(contentType, extension) };
  }

  if (contentType && contentType.startsWith('application/')) {
    const pageLikeApplicationTypes = new Set([
      'application/xhtml+xml',
      'application/javascript',
      'application/ecmascript'
    ]);

    if (!pageLikeApplicationTypes.has(contentType)) {
      return { isFile: true, category: getFileCategory(contentType, extension) };
    }
  }

  const knownFileExtensions = getKnownFileExtensions();
  if (extension && knownFileExtensions.has(extension)) {
    return { isFile: true, category: getFileCategory(contentType, extension) };
  }

  return { isFile: false, category: 'page' };
}

function getFileCategory(contentType, extension) {
  if (contentType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (contentType.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (contentType.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (contentType.startsWith('font/') || FONT_EXTENSIONS.has(extension)) return 'font';
  if (ARCHIVE_EXTENSIONS.has(extension) || /(?:zip|gzip|compressed|tar|rar|7z)/.test(contentType)) return 'archive';
  if (DATA_EXTENSIONS.has(extension) || /(?:json|xml|csv|yaml|sql)/.test(contentType)) return 'data';
  if (DOCUMENT_EXTENSIONS.has(extension) || /(?:pdf|msword|officedocument|opendocument|rtf|epub)/.test(contentType)) return 'document';
  return 'file';
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'tif', 'tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'mpeg', 'mpg', 'ogv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus']);
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'epub']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);
const FONT_EXTENSIONS = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);
const DATA_EXTENSIONS = new Set(['json', 'xml', 'csv', 'tsv', 'yaml', 'yml', 'sql']);

function getKnownFileExtensions() {
  return new Set([
    ...IMAGE_EXTENSIONS,
    ...VIDEO_EXTENSIONS,
    ...AUDIO_EXTENSIONS,
    ...DOCUMENT_EXTENSIONS,
    ...ARCHIVE_EXTENSIONS,
    ...FONT_EXTENSIONS,
    ...DATA_EXTENSIONS
  ]);
}

function createDownloadFilename({ contentDisposition, contentType, url, tabTitle, fallbackIndex }) {
  const dispositionFilename = getFilenameFromContentDisposition(contentDisposition);
  const urlFilename = getFilenameFromPathname(url.pathname);
  const inferredExtension = getExtensionForMimeType(contentType);

  let filename = dispositionFilename || urlFilename;

  if (!filename || filename === '/' || filename === '.') {
    filename = sanitizeFilename(tabTitle || `download-${fallbackIndex}`);
  }

  filename = sanitizeFilename(filename);

  if (!getFileExtension(filename) && inferredExtension) {
    filename += `.${inferredExtension}`;
  }

  return filename || `download-${fallbackIndex}${inferredExtension ? `.${inferredExtension}` : ''}`;
}

function getFilenameFromContentDisposition(contentDisposition) {
  if (!contentDisposition) return '';

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^['"]|['"]$/g, ''));
    } catch {
      return utf8Match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }

  const basicMatch = contentDisposition.match(/filename\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;]+))/i);
  return (basicMatch?.[1] || basicMatch?.[2] || basicMatch?.[3] || '').trim();
}

function getFilenameFromPathname(pathname) {
  const rawSegment = pathname.split('/').filter(Boolean).pop() || '';
  if (!rawSegment) return '';

  try {
    return decodeURIComponent(rawSegment);
  } catch {
    return rawSegment;
  }
}

function sanitizeFilename(filename) {
  const sanitized = String(filename || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  const safeName = reservedWindowsNames.test(sanitized) ? `_${sanitized}` : sanitized;

  return safeName.slice(0, 180) || 'download';
}

function assignUniqueFilenames(files) {
  const usedNames = new Set();

  return files.map((file) => {
    let filename = file.filename;
    let counter = 2;

    while (usedNames.has(filename.toLowerCase())) {
      filename = appendFilenameCounter(file.filename, counter);
      counter += 1;
    }

    usedNames.add(filename.toLowerCase());
    return { ...file, filename };
  });
}

function appendFilenameCounter(filename, counter) {
  const lastDotIndex = filename.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return `${filename} (${counter})`;
  }

  return `${filename.slice(0, lastDotIndex)} (${counter})${filename.slice(lastDotIndex)}`;
}

function normalizeDomainInput(value) {
  const trimmedValue = String(value || '').trim();

  if (!trimmedValue) {
    throw new Error('Enter a domain such as example.com.');
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(trimmedValue.includes('://') ? trimmedValue : `https://${trimmedValue}`);
  } catch {
    throw new Error('The domain is invalid. Use a value such as example.com.');
  }

  const hostname = normalizeHostname(parsedUrl.hostname);

  if (!hostname || hostname.includes(' ') || hostname.includes('*')) {
    throw new Error('The domain is invalid. Wildcards and spaces are not supported.');
  }

  return hostname;
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

function hostnameMatchesDomain(hostname, domain) {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedDomain = normalizeHostname(domain);

  return normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

function removeQueryString(rawUrl) {
  const url = new URL(rawUrl);
  url.search = '';
  return url.toString();
}

function formatUrlsForClipboard(urls) {
  return urls.map((url) => JSON.stringify(url)).join(',');
}

async function copyTextToClipboard(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Text clipboard write is not available in this browser.');
  }

  await navigator.clipboard.writeText(text);
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

function createScreenshotFilename() {
  return `page-screenshot-${formatTimestamp(new Date())}.png`;
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');

  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-') +
    '-' +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-');
}

function normalizeMimeType(contentType) {
  return String(contentType || '').split(';')[0].trim().toLowerCase();
}

function getFileExtension(filename) {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match?.[1] || '';
}

function getExtensionForMimeType(contentType) {
  const mimeExtensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/json': 'json',
    'text/csv': 'csv',
    'text/plain': 'txt',
    'font/woff': 'woff',
    'font/woff2': 'woff2'
  };

  return mimeExtensions[contentType] || '';
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        const value = await worker(items[currentIndex], currentIndex);
        results[currentIndex] = { status: 'fulfilled', value };
      } catch (reason) {
        results[currentIndex] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function renderPreparedFiles() {
  preparedFilesList.replaceChildren();

  if (preparedFiles.length === 0) {
    preparedFilesPanel.hidden = true;
    return;
  }

  preparedFiles.forEach((file) => {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    const metadata = document.createElement('span');

    name.textContent = file.filename;
    name.title = file.filename;
    metadata.textContent = `${file.category} · ${formatBytes(file.size)}`;

    item.append(name, metadata);
    preparedFilesList.append(item);
  });

  preparedFilesCount.textContent = `${preparedFiles.length} file${preparedFiles.length === 1 ? '' : 's'} ready`;
  preparedFilesSize.textContent = formatBytes(getPreparedFilesTotalSize());
  preparedFilesPanel.hidden = false;
}

function clearPreparedFiles() {
  preparedFiles = [];
  preparedFilesPanel.hidden = true;
  preparedFilesList.replaceChildren();
}

function getPreparedFilesTotalSize() {
  return preparedFiles.reduce((total, file) => total + file.size, 0);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function setMessage(message, state = 'info') {
  const normalizedState = Object.prototype.hasOwnProperty.call(MESSAGE_STATES, state) ? state : 'info';
  const config = MESSAGE_STATES[normalizedState];

  messageBar.className = `message-bar message-bar--${normalizedState}`;
  messageBar.dataset.state = normalizedState;
  messageBar.setAttribute('role', config.role);
  messageIcon.textContent = config.icon;
  messageText.textContent = String(message || '');

  if (currentView === 'home') {
    requestAnimationFrame(updateHomeMessageReservedSpace);
  }
}

function setStartingRegionScan(nextState) {
  isStartingRegionScan = nextState;
  scanRegionTextBtn.disabled = nextState;
  scanRegionTextBtn.setAttribute('aria-disabled', String(nextState));
}

function setCapturing(nextState) {
  isCapturing = nextState;
  pageScreenshotBtn.disabled = nextState;
  pageScreenshotBtn.setAttribute('aria-disabled', String(nextState));
}

function setSavingScreenshot(nextState) {
  isSavingScreenshot = nextState;
  saveScreenshotBtn.disabled = nextState || !lastScreenshot?.dataUrl;
  saveScreenshotBtn.setAttribute('aria-disabled', String(nextState || !lastScreenshot?.dataUrl));
}

function setSaveScreenshotButtonEnabled(isEnabled) {
  saveScreenshotBtn.disabled = !isEnabled;
  saveScreenshotBtn.setAttribute('aria-disabled', String(!isEnabled));
}

function setStartingAnnotation(nextState) {
  isStartingAnnotation = nextState;
  annotateScreenshotBtn.disabled = nextState;
  annotateScreenshotBtn.setAttribute('aria-disabled', String(nextState));
}

function setCopyingUrls(nextState) {
  isCopyingUrls = nextState;
  copyUrlsSubmitBtn.disabled = nextState;
  copyUrlsSubmitBtn.setAttribute('aria-disabled', String(nextState));
}

function setPreparingFiles(nextState) {
  isPreparingFiles = nextState;
  downloadFilesSubmitBtn.disabled = nextState;
  downloadFilesSubmitBtn.setAttribute('aria-disabled', String(nextState));
}

function setWritingFiles(nextState) {
  isWritingFiles = nextState;
  savePreparedFilesBtn.disabled = nextState;
  savePreparedFilesBtn.setAttribute('aria-disabled', String(nextState));
  downloadFilesSubmitBtn.disabled = nextState || isPreparingFiles;
  downloadFilesSubmitBtn.setAttribute('aria-disabled', String(nextState || isPreparingFiles));
}

function closePopup() {
  window.close();
}

function getFriendlyError(error) {
  const message = error?.message || String(error || 'Unknown error');

  if (
    message.includes('Cannot access') ||
    message.includes('cannot be scripted') ||
    message.includes('extensions gallery') ||
    message.includes('Chrome cannot run Scan Region To Text') ||
    message.includes('Chrome cannot run Annotate Screenshot')
  ) {
    return 'Chrome cannot access this page. Try a normal HTTP/HTTPS website.';
  }

  if (message.includes('activeTab') || message.includes('tabs') || message.includes('permission')) {
    return 'The required tab permission is missing. Reload the extension and try again.';
  }

  if (message.includes('clipboard') || message.includes('Clipboard')) {
    return 'Chrome could not write to the clipboard. Click inside the popup and try again.';
  }

  if (message.includes('downloads') || message.includes('Download')) {
    return 'Chrome could not create the download. Check the extension permissions.';
  }

  if (message.includes('Failed to fetch')) {
    return 'A matching URL could not be fetched. The server may require authentication or block the request.';
  }

  if (error?.name === 'NotAllowedError' || message.includes('user activation')) {
    return 'Chrome blocked the folder picker. Click “Choose folder & save” directly and try again.';
  }

  return message;
}
