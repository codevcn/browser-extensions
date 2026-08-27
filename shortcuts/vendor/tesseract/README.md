# Local OCR runtime assets

`Scan Region To Text` uses Tesseract.js locally. The large third-party OCR runtime files are intentionally fetched by `setup-ocr-assets.cmd` before loading/reloading the extension.

Pinned versions:

- Tesseract.js: `7.0.0`
- Tesseract.js Core: `7.0.0`
- English trained data: `@tesseract.js-data/eng@1.0.0`, `4.0.0_best_int`
- Vietnamese trained data: `@tesseract.js-data/vie@1.0.0`, `4.0.0_best_int`

Expected files after setup:

```text
tesseract.min.js
worker.min.js
core/
  tesseract-core.wasm.js
  tesseract-core-lstm.wasm.js
  tesseract-core-simd.wasm.js
  tesseract-core-simd-lstm.wasm.js
  tesseract-core-relaxedsimd.wasm.js
  tesseract-core-relaxedsimd-lstm.wasm.js
lang/
  eng.traineddata.gz
  vie.traineddata.gz
LICENSE-tesseract-js.md
LICENSE-tesseract-core.txt
```

The extension never loads executable OCR code from a CDN at runtime. Once setup is complete, the OCR engine and language data are loaded from the extension's own `chrome-extension://` origin.
