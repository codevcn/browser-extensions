"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var EShortcuts;
(function (EShortcuts) {
    EShortcuts["OPEN_PROMPTS"] = "o";
})(EShortcuts || (EShortcuts = {}));
class Toaster {
    constructor() {
        this.toaster = document.getElementById("toaster");
    }
    show(message, type = "success") {
        this.toaster.textContent = message;
        this.toaster.classList.remove("success", "error", "warning");
        requestAnimationFrame(() => {
            this.toaster.classList.add(type);
        });
    }
}
const toaster = new Toaster();
class App {
    constructor() {
        this.loadedPrompts = [];
        this.selectedPromptIndex = -1;
        this.patterns = [];
        this.originalText = "";
        this.TEXT_PLACEHOLDER_STR_KEY = "text-placeholder";
        this.timeoutFlag = undefined;
        this.inputTextarea = document.getElementById("input-textarea");
        this.outputTextarea = document.getElementById("output-textarea");
        this.patternsContainer = document.getElementById("patterns-container");
        this.copyButton = document.getElementById("copy-button");
        this.textPlaceholderTextarea = document.querySelector(".text-placeholder");
        this.openPromptsBtn = document.getElementById("open-prompts-btn");
        this.promptsModal = document.getElementById("prompts-modal");
        this.closeBtn = document.querySelector(".close-btn");
        this.promptsList = document.getElementById("prompts-list");
        this.bindEvents();
        this.focusOnAppStarted();
        this.fillTextPlaceholder();
    }
    fillTextPlaceholder() {
        chrome.storage.local.get([this.TEXT_PLACEHOLDER_STR_KEY], (result) => {
            console.log(">>> fillTextPlaceholder:", result);
            this.textPlaceholderTextarea.value = result[this.TEXT_PLACEHOLDER_STR_KEY] || "";
        });
    }
    onEditTextPlaceholder() {
        clearTimeout(this.timeoutFlag);
        this.timeoutFlag = setTimeout(() => {
            const text = this.textPlaceholderTextarea.value;
            chrome.storage.local.set({ [this.TEXT_PLACEHOLDER_STR_KEY]: text }, () => { });
        }, 300);
    }
    focusOnAppStarted() {
        this.inputTextarea.focus();
    }
    bindEvents() {
        // Xử lý sự kiện input để phân tích pattern
        this.inputTextarea.addEventListener("input", () => {
            this.analyzePatterns();
        });
        // Xử lý sự kiện copy
        this.copyButton.addEventListener("click", () => {
            this.copyToClipboard();
        });
        // Xử lý sự kiện nhập text placeholder
        this.textPlaceholderTextarea.addEventListener("input", () => {
            this.onEditTextPlaceholder();
        });
        // Xử lý sự kiện mở danh sách prompt
        this.openPromptsBtn.addEventListener("click", () => {
            this.promptsModal.classList.remove("hidden");
            this.loadPrompts();
        });
        // Xử lý sự kiện đóng danh sách prompt
        this.closeBtn.addEventListener("click", () => {
            this.promptsModal.classList.add("hidden");
        });
        // Đóng modal khi click ra ngoài vùng content
        this.promptsModal.addEventListener("click", (e) => {
            if (e.target === this.promptsModal) {
                this.promptsModal.classList.add("hidden");
            }
        });
        // Xử lý phím tắt
        document.addEventListener("keydown", (e) => {
            // Alt + L để bật/tắt modal prompts
            if (e.altKey && e.key.toLowerCase() === EShortcuts.OPEN_PROMPTS) {
                e.preventDefault();
                if (this.promptsModal.classList.contains("hidden")) {
                    this.promptsModal.classList.remove("hidden");
                    this.loadPrompts();
                }
                return;
            }
            // Xử lý điều hướng trong modal nếu modal đang mở
            if (!this.promptsModal.classList.contains("hidden") && this.loadedPrompts.length > 0) {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (this.selectedPromptIndex === this.loadedPrompts.length - 1) {
                        this.selectedPromptIndex = 0;
                    }
                    else {
                        this.selectedPromptIndex++;
                    }
                    this.updatePromptSelection();
                }
                else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (this.selectedPromptIndex <= 0) {
                        this.selectedPromptIndex = this.loadedPrompts.length - 1;
                    }
                    else {
                        this.selectedPromptIndex--;
                    }
                    this.updatePromptSelection();
                }
                else if (e.key === "Enter") {
                    e.preventDefault();
                    if (this.selectedPromptIndex >= 0 &&
                        this.selectedPromptIndex < this.loadedPrompts.length) {
                        this.selectPrompt(this.loadedPrompts[this.selectedPromptIndex]);
                    }
                }
                else if (e.key === "Escape") {
                    this.promptsModal.classList.add("hidden");
                }
            }
        });
    }
    loadPrompts() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.loadedPrompts.length > 0) {
                this.renderPrompts();
                return;
            }
            this.promptsList.innerHTML = '<div class="loading-text">Đang tải...</div>';
            const prompts = [];
            let index = 1;
            while (true) {
                try {
                    const url = chrome.runtime.getURL(`prompts/prompt-${index}.txt`);
                    const response = yield fetch(url);
                    if (!response.ok)
                        break;
                    const text = yield response.text();
                    const parsedPrompts = this.parsePromptsText(text);
                    prompts.push(...parsedPrompts);
                    index++;
                }
                catch (e) {
                    // Chrome fetch throws TypeError: Failed to fetch if local file doesn't exist.
                    // Cuối danh sách (ví dụ đến 3.txt không có), lỗi này ném ra là bình thường.
                    break;
                }
            }
            this.loadedPrompts = prompts;
            this.renderPrompts();
        });
    }
    parsePromptsText(text) {
        const results = [];
        const regex = /@@\[(.*?)\]<<<\s*description:\s*<<\s*(.*?)\s*>>\s*value:\s*<<([\s\S]*?)>>\s*>>>/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            results.push({
                id: match[1].trim(),
                description: match[2].trim(),
                value: match[3].trim(),
            });
        }
        return results;
    }
    renderPrompts() {
        this.promptsList.innerHTML = "";
        if (this.loadedPrompts.length === 0) {
            this.promptsList.innerHTML = '<div class="loading-text">Không tìm thấy prompt nào.</div>';
            return;
        }
        this.loadedPrompts.forEach((p) => {
            const item = document.createElement("div");
            item.className = "prompt-item";
            const desc = document.createElement("div");
            desc.className = "prompt-desc";
            desc.textContent = p.description;
            const val = document.createElement("div");
            val.className = "prompt-value";
            val.textContent = p.value;
            item.appendChild(desc);
            item.appendChild(val);
            item.addEventListener("click", () => {
                this.selectPrompt(p);
            });
            this.promptsList.appendChild(item);
        });
        this.selectedPromptIndex = -1;
    }
    selectPrompt(p) {
        this.inputTextarea.value = p.value;
        this.promptsModal.classList.add("hidden");
        this.analyzePatterns();
    }
    updatePromptSelection() {
        const items = this.promptsList.querySelectorAll(".prompt-item");
        items.forEach((item, index) => {
            if (index === this.selectedPromptIndex) {
                item.classList.add("selected");
                item.scrollIntoView({ block: "nearest" });
            }
            else {
                item.classList.remove("selected");
            }
        });
    }
    analyzePatterns() {
        const text = this.inputTextarea.value;
        this.originalText = text;
        // Tìm tất cả các pattern {{ text here... }}
        const patternRegex = /\{\{\s*([^}]+)\s*\}\}/g;
        const matches = [];
        let match;
        while ((match = patternRegex.exec(text)) !== null) {
            matches.push(match);
        }
        // Tạo danh sách pattern duy nhất (không trùng lặp)
        const uniquePatterns = new Map();
        matches.forEach((match) => {
            const placeholder = match[1].trim();
            if (!uniquePatterns.has(placeholder)) {
                uniquePatterns.set(placeholder, match[0]);
            }
        });
        this.patterns = Array.from(uniquePatterns.entries()).map(([placeholder, fullMatch]) => ({
            fullMatch,
            placeholder,
            value: "",
        }));
        // Tạo các input cho pattern
        this.createPatternInputs();
        // Cập nhật output
        this.updateOutput();
    }
    createPatternInputs() {
        // Xóa tất cả input cũ
        this.patternsContainer.innerHTML = "";
        if (this.patterns.length === 0) {
            this.patternsContainer.innerHTML =
                '<p style="color: #666; font-style: italic; font-size: 12px">Không tìm thấy pattern nào</p>';
            return;
        }
        // Tạo input cho mỗi pattern
        this.patterns.forEach((pattern, index) => {
            const patternDiv = document.createElement("div");
            patternDiv.className = "pattern-input";
            const label = document.createElement("span");
            label.className = "pattern-label";
            label.textContent = pattern.placeholder;
            const input = document.createElement("input");
            input.type = "text";
            input.placeholder = `${pattern.placeholder}`;
            input.value = pattern.value;
            // Xử lý sự kiện input và enter
            input.addEventListener("input", (e) => {
                const target = e.target;
                pattern.value = target.value;
                this.updateOutput();
            });
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    this.updateOutput();
                    this.copyToClipboard();
                }
            });
            patternDiv.appendChild(label);
            patternDiv.appendChild(input);
            this.patternsContainer.appendChild(patternDiv);
        });
    }
    updateOutput() {
        let result = this.originalText;
        // Thay thế tất cả các pattern giống nhau cùng lúc
        this.patterns.forEach((pattern) => {
            if (pattern.value.trim()) {
                // Sử dụng regex để thay thế tất cả các pattern giống nhau
                const replaceRegex = new RegExp(pattern.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
                result = result.replace(replaceRegex, pattern.value);
            }
        });
        this.outputTextarea.value = result;
    }
    copyToClipboard() {
        return __awaiter(this, void 0, void 0, function* () {
            const finalOutput = this.outputTextarea.value;
            if (!finalOutput) {
                toaster.show("Không có kết quả để copy!", "warning");
                return;
            }
            try {
                yield navigator.clipboard.writeText(finalOutput);
                toaster.show("Đã copy kết quả vào clipboard!", "success");
            }
            catch (err) {
                // Fallback cho các trình duyệt cũ
                this.outputTextarea.select();
                try {
                    document.execCommand("copy");
                }
                catch (error) {
                    toaster.show("Lỗi không copy được vào clipboard!", "error");
                }
                toaster.show("Đã copy kết quả vào clipboard!", "success");
            }
        });
    }
}
// Khởi tạo ứng dụng khi DOM đã sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
    new App();
});
//# sourceMappingURL=popup.js.map