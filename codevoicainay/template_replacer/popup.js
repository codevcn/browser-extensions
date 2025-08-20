var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var Toaster = /** @class */ (function () {
    function Toaster() {
        this.toaster = document.getElementById("toaster");
    }
    Toaster.prototype.show = function (message, type) {
        var _this = this;
        if (type === void 0) { type = "success"; }
        this.toaster.textContent = message;
        this.toaster.classList.remove("success", "error", "warning");
        requestAnimationFrame(function () {
            _this.toaster.classList.add(type);
        });
    };
    return Toaster;
}());
var toaster = new Toaster();
var App = /** @class */ (function () {
    function App() {
        this.patterns = [];
        this.originalText = "";
        this.inputTextarea = document.getElementById("input-textarea");
        this.outputTextarea = document.getElementById("output-textarea");
        this.patternsContainer = document.getElementById("patterns-container");
        this.copyButton = document.getElementById("copy-button");
        this.bindEvents();
    }
    App.prototype.bindEvents = function () {
        var _this = this;
        // Xử lý sự kiện input để phân tích pattern
        this.inputTextarea.addEventListener("input", function () {
            _this.analyzePatterns();
        });
        // Xử lý sự kiện copy
        this.copyButton.addEventListener("click", function () {
            _this.copyToClipboard();
        });
    };
    App.prototype.analyzePatterns = function () {
        var text = this.inputTextarea.value;
        this.originalText = text;
        // Tìm tất cả các pattern {{ text here... }}
        var patternRegex = /\{\{\s*([^}]+)\s*\}\}/g;
        var matches = [];
        var match;
        while ((match = patternRegex.exec(text)) !== null) {
            matches.push(match);
        }
        // Tạo danh sách pattern duy nhất (không trùng lặp)
        var uniquePatterns = new Map();
        matches.forEach(function (match) {
            var placeholder = match[1].trim();
            if (!uniquePatterns.has(placeholder)) {
                uniquePatterns.set(placeholder, match[0]);
            }
        });
        this.patterns = Array.from(uniquePatterns.entries()).map(function (_a) {
            var placeholder = _a[0], fullMatch = _a[1];
            return ({
                fullMatch: fullMatch,
                placeholder: placeholder,
                value: "",
            });
        });
        // Tạo các input cho pattern
        this.createPatternInputs();
        // Cập nhật output
        this.updateOutput();
    };
    App.prototype.createPatternInputs = function () {
        var _this = this;
        // Xóa tất cả input cũ
        this.patternsContainer.innerHTML = "";
        if (this.patterns.length === 0) {
            this.patternsContainer.innerHTML =
                '<p style="color: #666; font-style: italic;">Không tìm thấy pattern nào</p>';
            return;
        }
        // Tạo input cho mỗi pattern
        this.patterns.forEach(function (pattern, index) {
            var patternDiv = document.createElement("div");
            patternDiv.className = "pattern-input";
            var label = document.createElement("span");
            label.className = "pattern-label";
            label.textContent = pattern.placeholder;
            var input = document.createElement("input");
            input.type = "text";
            input.placeholder = "Nh\u1EADp gi\u00E1 tr\u1ECB cho: ".concat(pattern.placeholder);
            input.value = pattern.value;
            // Xử lý sự kiện input và enter
            input.addEventListener("input", function (e) {
                var target = e.target;
                pattern.value = target.value;
                _this.updateOutput();
            });
            input.addEventListener("keydown", function (e) {
                var _a, _b;
                if (e.key === "Enter") {
                    // Tự động focus vào input tiếp theo
                    var nextInput = (_b = (_a = input.parentElement) === null || _a === void 0 ? void 0 : _a.nextElementSibling) === null || _b === void 0 ? void 0 : _b.querySelector("input");
                    if (nextInput) {
                        nextInput.focus();
                    }
                }
            });
            patternDiv.appendChild(label);
            patternDiv.appendChild(input);
            _this.patternsContainer.appendChild(patternDiv);
        });
    };
    App.prototype.updateOutput = function () {
        var result = this.originalText;
        // Thay thế tất cả các pattern giống nhau cùng lúc
        this.patterns.forEach(function (pattern) {
            if (pattern.value.trim()) {
                // Sử dụng regex để thay thế tất cả các pattern giống nhau
                var replaceRegex = new RegExp(pattern.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                result = result.replace(replaceRegex, pattern.value);
            }
        });
        this.outputTextarea.value = result;
    };
    App.prototype.copyToClipboard = function () {
        return __awaiter(this, void 0, void 0, function () {
            var err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, navigator.clipboard.writeText(this.outputTextarea.value)];
                    case 1:
                        _a.sent();
                        toaster.show("Đã copy kết quả vào clipboard!", "success");
                        return [3 /*break*/, 3];
                    case 2:
                        err_1 = _a.sent();
                        // Fallback cho các trình duyệt cũ
                        this.outputTextarea.select();
                        document.execCommand("copy");
                        toaster.show("Đã copy kết quả vào clipboard!", "success");
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return App;
}());
// Khởi tạo ứng dụng khi DOM đã sẵn sàng
document.addEventListener("DOMContentLoaded", function () {
    new App();
});
