# Shortcuts Extension

A keyboard-first Manifest V3 Chrome extension for screenshots, tab URL collection, and file downloads by domain.

## Features

### Global popup shortcut

- `Alt + 0`: open the extension popup.

### Home

- `1` — **Page Screenshot**
  - Captures the visible viewport of the active tab.
  - Copies the PNG image to the clipboard.
- `2` — **Copy URLs by Domain**
  - Opens a form for a domain such as `example.com`.
  - Searches every open HTTP/HTTPS tab.
  - Matches the domain and its subdomains.
  - Copies URLs using this format:
    - `"https://domain.com/1","http://example.net?abc=123"`
  - Optional checkbox removes query strings while preserving URL fragments.
- `3` — **Download Files by Domain**
  - Opens a form for a domain.
  - Copies matching full tab URLs to the clipboard.
  - Fetches all matching URLs with a concurrency limit of four requests.
  - Detects file responses from headers, MIME types, and known extensions.
  - Skips normal HTML pages.
  - Shows prepared filenames, categories, and sizes.
  - Lets the user choose one folder and writes all prepared files to it.
- `S` — **Save Screenshot**
  - Opens Save As for the latest screenshot captured in the current popup session.
- `Q` — **Close**
  - On Home: closes the popup.
  - Inside feature sections: returns to Home.

### Form shortcuts

- `Enter`: submits the active feature form.

## Message bar

The bottom message bar is managed only through `setMessage(message, state)`.

Supported states:

- `success`
- `error`
- `warning`
- `info`

The styling uses Atlassian-style semantic message colors and roles.

## Required permissions

- `activeTab`: screenshot access for the active tab.
- `clipboardWrite`: write images and text to the clipboard.
- `downloads`: save the latest screenshot through Chrome Downloads.
- `tabs`: read URLs and titles from all open tabs.
- `host_permissions` for `http://*/*` and `https://*/*`: fetch matching tab URLs across domains.

Chrome will show broader permission warnings because features 2 and 3 need access to open-tab URLs and remote file responses.

## File detection

A response is treated as a file when one or more of these conditions apply:

- `Content-Disposition` marks it as an attachment.
- The MIME type is an image, video, audio, font, model, document, archive, or data format.
- The URL/filename has a known file extension.

Responses with `text/html` or `application/xhtml+xml` are treated as normal web pages unless served as attachments.

## Download workflow

Feature 3 intentionally uses two user actions:

1. **Scan matching tabs** fetches and prepares the file data.
2. **Choose folder & save** opens the system folder picker and writes the files.

The second click is required because Chrome only permits the folder picker from a direct user activation.

## Install for development

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder.

After updating an existing installation, click **Reload** on the extension card so Chrome applies the new manifest permissions.

## Notes

- The screenshot captures only the visible viewport, not the entire scrollable page.
- Chrome internal pages such as `chrome://extensions` cannot be captured or fetched.
- Protected URLs can still fail if the remote server rejects the request or requires a session that is unavailable to the extension request.
- Prepared file data is held in popup memory until the popup closes or a new scan starts. Very large files can consume significant memory.
- `background.js` remains unused and is not registered in the manifest.


## 2.0.1 patch

- Fixed the File System Access API picker ID by changing it to `shortcut-downloads` (under the 32-character limit).
- Updated the primary interface palette to Atlassian-inspired white, black, and light-neutral gray tokens.
- Semantic success, error, warning, and information message colors remain unchanged for accessibility and meaning.
