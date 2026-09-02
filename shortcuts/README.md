# Shortcuts Extension v4.0.0

A keyboard-first Chrome Manifest V3 extension for viewport screenshots, screenshot annotation, tab URL utilities, file downloads, and local OCR region scanning.

## One-time OCR setup

`Scan Region To Text` uses Tesseract.js 7.0.0 and English + Vietnamese trained data locally. Before loading/reloading this source build:

1. Run `setup-ocr-assets.cmd` on Windows.
2. Wait for `[DONE] OCR assets are ready.`
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select this folder, or click **Reload** if it is already installed.

The setup script pins the OCR versions and downloads them into `vendor/tesseract/`. At extension runtime, executable OCR code is loaded only from the extension package itself; screenshots are not sent to an OCR service.

## Home status message behavior

- The Home status/message bar is fixed to the bottom of the popup viewport, so it remains visible while the Home action list scrolls.
- Home dynamically reserves bottom space based on the message bar's rendered height, preventing the final action from being covered by long messages.
- Feature views keep the existing in-flow message behavior.

## Shortcuts

### Global popup shortcut

- `Alt + 0` — open the extension popup.

### Home

- `1` — **Page Screenshot**
  - Captures the visible viewport of the active tab.
  - Copies the PNG image to the clipboard.
- `2` — **Annotate Screenshot**
  - Opens a transparent full-viewport annotation layer on the active website.
  - Covers the page with `rgba(0,0,0,0.3)`.
  - Uses the full visible viewport as the default screenshot area.
  - `x` selects two points to crop the screenshot area.
  - `a` selects two points to draw an arrow.
  - `r` selects two points to draw a rectangle border.
  - `t` selects one point for a textbox; `OK` or `Enter` while focused applies the typed text.
  - Text annotations default to `14px` font size.
  - `s` opens or closes annotation settings for seven colors, `1px` to `50px` line width, and text font size. The selected color and font size apply to new text annotations.
  - `` ` `` resets the overlay to its initial full-viewport state.
  - `p` opens a toolbar with Crop, Arrow, Rectangle, Text, Settings, and Help buttons.
  - `h` opens or closes the shortcuts help popup.
  - `Ctrl + Z` undoes the latest annotation change.
  - `Ctrl + Y` redoes the latest undone annotation change.
  - `c` captures the screenshot area and copies the PNG to the clipboard.
  - `o` captures the screenshot area and opens the Chrome save dialog for the PNG.
  - `q` or `Esc` exits the annotation layer without reopening the extension popup.
  - `Enter` captures the screenshot area, copies the PNG to the clipboard, then exits the annotation layer.
- `3` — **Copy URLs by Domain**
  - Opens a form for a domain such as `example.com`.
  - Searches every open HTTP/HTTPS tab.
  - Matches the domain and its subdomains.
  - Optional checkbox removes query strings while preserving URL fragments.
- `4` — **Download Files by Domain**
  - Opens a form for a domain.
  - Copies matching full tab URLs to the clipboard.
  - Fetches matching URLs with a concurrency limit of four requests.
  - Detects file responses from headers, MIME types, and known extensions.
  - Skips normal HTML pages.
  - Lets the user choose one folder and writes all prepared files to it.
- `9` — **Scan Region To Text**
  - Opens a transparent full-viewport selection layer on the active website.
  - First click sets one rectangle corner; second click sets the opposite corner.
  - The rectangle is normalized, so clicking in the reverse direction still works.
  - Uses a `3px solid` dark-purple border controlled by CSS variables:
    - `--shortcuts-region-scan-border`
    - `--shortcuts-region-scan-border-width`
  - Captures the real visible browser pixels with `chrome.tabs.captureVisibleTab()`.
  - Crops the selected area using the screenshot/viewport scale ratio, which handles HiDPI and browser zoom more reliably than assuming `devicePixelRatio`.
  - Runs local OCR with Tesseract.js + WebAssembly in an offscreen extension document using the combined `eng+vie` language set.
  - Starts with no floating status box or buttons; only the crosshair canvas is active until two points are selected.
  - After the second point, shows the OCR status box plus `Reset` and `OK` controls.
  - `Reset` clears the rectangle/result immediately so a new region can be selected from scratch.
  - Displays recognized text in a selectable result panel with a Copy icon button.
  - Copy button or `Ctrl + C` copies the entire recognized result; successful copy switches to a Check icon for 2 seconds.
  - `OK`, `Q`, `Esc`, or `Ctrl + Q` closes the scanner.
- `S` — **Save Screenshot**
  - Opens Save As for the latest screenshot captured in the current popup session.
- `Q` — **Close**
  - On Home: closes the popup.
  - Inside feature sections: returns to Home.

### Form shortcut

- `Enter` — submit the active feature form.

## Scan Region To Text architecture

```text
Popup (9)
  -> chrome.scripting injects the lightweight region selector
  -> user selects a rectangle
  -> selector hides itself for capture
  -> service worker verifies the source tab is still active
  -> chrome.tabs.captureVisibleTab()
  -> service worker immediately tells selector capture is complete
  -> selector becomes visible again with OCR progress
  -> offscreen.html crops the screenshot at screenshot resolution
  -> Tesseract.js Web Worker + WASM recognizes English and Vietnamese text locally
  -> selectable text is returned to the page overlay
```

### OCR behavior and safeguards

- OCR is pixel-based, so it works for normal DOM text, text inside images, canvas-rendered text, screenshots, and other visible rasterized content.
- No floating status/control UI is shown before the two selection points are complete.
- The selection overlay is hidden before capture so its border/status UI is not included in OCR input.
- Very small selections are rejected to avoid accidental scans.
- Small crops are upscaled before OCR to improve recognition of UI-sized text.
- OCR requests are serialized through one worker to avoid concurrent-worker state issues.
- The initialized worker is reused briefly for faster repeated scans, then terminated after 2 minutes of inactivity.
- Scrolling is blocked while the selector is active so the chosen coordinates stay stable.
- Re-injecting feature `9` while a scanner is already active does not create a duplicate instance.
- Reset invalidates the current request on the page, preventing stale OCR results from replacing a newer selection.
- OCR result copy uses the Clipboard API first and falls back to a temporary textarea + `execCommand('copy')` if needed.
- Chrome internal pages cannot be scripted by this feature.

## v3.0.3 fix

- Fixed the Region OCR Copy button click handler so direct clicks reach the button before the result popover stops event bubbling.
- `Ctrl+C` and direct Copy clicks now use the same copy function and the same 2-second checkmark feedback.

## Versioning

- Extension release: **4.0.0**
- Chrome manifest format: **Manifest V3**
- OCR engine: **Tesseract.js 7.0.0**

The popup reads its displayed extension version directly from `manifest.json` using `chrome.runtime.getManifest()`, so the UI version does not need to be updated separately.

## Required permissions

- `activeTab` — capture the active visible tab.
- `clipboardWrite` — write images and text to the clipboard.
- `downloads` — save the latest screenshot through Chrome Downloads.
- `offscreen` — run local OCR in a hidden extension document with DOM/Worker support.
- `scripting` — inject the screenshot annotator for feature `2` and the region selector for feature `9`.
- `tabs` — read tab URLs/titles and route OCR progress to the source tab.
- `host_permissions` for `http://*/*` and `https://*/*` — features 3 and 4 need access to matching open-tab URLs and remote file responses.

Minimum Chrome version is 109 because `chrome.offscreen` is used for OCR.

## Content Security Policy

Manifest V3 extension pages use:

```text
script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'self';
```

This enables the bundled Tesseract WebAssembly runtime while keeping executable scripts and workers restricted to the extension package.

## File detection for feature 3

A response is treated as a file when one or more of these conditions apply:

- `Content-Disposition` marks it as an attachment.
- The MIME type is an image, video, audio, font, model, document, archive, or data format.
- The URL/filename has a known file extension.

Responses with `text/html` or `application/xhtml+xml` are treated as normal web pages unless served as attachments.

## Notes

- Page Screenshot and Region OCR capture only the visible viewport, not the entire scrollable page.
- OCR accuracy depends on the visible pixels. Very tiny, blurred, rotated, stylized, or low-contrast text can be less accurate.
- This build bundles English and Vietnamese OCR data (`eng + vie`) after running the setup script.
- Feature `Q` and `Ctrl + Q` are handled at page level while the scanner is active; browser/OS-reserved shortcuts can still take precedence on some systems. `Esc` is the reliable exit shortcut.
- Prepared download-file data for feature 4 remains in popup memory until the popup closes or a new scan starts.

## Project files added in v3.0.4

```text
background.js                 MV3 service worker for capture/OCR routing
region-scan/region-scan.js   selection UI and result interaction
region-scan/region-scan.css  isolated scanner styling and purple border tokens
offscreen.html               hidden OCR document
offscreen.js                 crop, OCR queue, worker lifecycle
setup-ocr-assets.cmd         Windows one-click OCR dependency setup
setup-ocr-assets.ps1         pinned/retrying asset downloader
vendor/tesseract/README.md   expected local OCR runtime layout
THIRD_PARTY_NOTICES.md       third-party package notices
```

The obsolete `manifest.json.backup` from the previous release was removed to avoid stale version/configuration drift.
