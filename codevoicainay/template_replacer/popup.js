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
        this.patterns = [];
        this.originalText = "";
        this.TEXT_PLACEHOLDER_STR_KEY = "text-placeholder";
        this.timeoutFlag = undefined;
        this.inputTextarea = document.getElementById("input-textarea");
        this.outputTextarea = document.getElementById("output-textarea");
        this.patternsContainer = document.getElementById("patterns-container");
        this.copyButton = document.getElementById("copy-button");
        this.textPlaceholderTextarea = document.querySelector(".text-placeholder");
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
                '<p style="color: #666; font-style: italic;">Không tìm thấy pattern nào</p>';
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
            input.placeholder = `Nhập giá trị cho: ${pattern.placeholder}`;
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