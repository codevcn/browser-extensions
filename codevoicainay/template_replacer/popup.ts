interface Pattern {
  fullMatch: string
  placeholder: string
  value: string
}

class Toaster {
  private toaster: HTMLDivElement

  constructor() {
    this.toaster = document.getElementById("toaster") as HTMLDivElement
  }

  show(message: string, type: "success" | "error" | "warning" = "success"): void {
    this.toaster.textContent = message
    this.toaster.classList.remove("success", "error", "warning")
    requestAnimationFrame(() => {
      this.toaster.classList.add(type)
    })
  }
}
const toaster = new Toaster()

class App {
  private inputTextarea: HTMLTextAreaElement
  private outputTextarea: HTMLTextAreaElement
  private patternsContainer: HTMLDivElement
  private copyButton: HTMLButtonElement
  private patterns: Pattern[] = []
  private originalText: string = ""

  constructor() {
    this.inputTextarea = document.getElementById("input-textarea") as HTMLTextAreaElement
    this.outputTextarea = document.getElementById("output-textarea") as HTMLTextAreaElement
    this.patternsContainer = document.getElementById("patterns-container") as HTMLDivElement
    this.copyButton = document.getElementById("copy-button") as HTMLButtonElement

    this.bindEvents()
    this.focusOnAppStarted()
  }

  private focusOnAppStarted(): void {
    this.inputTextarea.focus()
  }

  private bindEvents(): void {
    // Xử lý sự kiện input để phân tích pattern
    this.inputTextarea.addEventListener("input", () => {
      this.analyzePatterns()
    })

    // Xử lý sự kiện copy
    this.copyButton.addEventListener("click", () => {
      this.copyToClipboard()
    })
  }

  private analyzePatterns(): void {
    const text = this.inputTextarea.value
    this.originalText = text

    // Tìm tất cả các pattern {{ text here... }}
    const patternRegex = /\{\{\s*([^}]+)\s*\}\}/g
    const matches: RegExpMatchArray[] = []
    let match
    while ((match = patternRegex.exec(text)) !== null) {
      matches.push(match)
    }

    // Tạo danh sách pattern duy nhất (không trùng lặp)
    const uniquePatterns = new Map<string, string>()
    matches.forEach((match) => {
      const placeholder = match[1].trim()
      if (!uniquePatterns.has(placeholder)) {
        uniquePatterns.set(placeholder, match[0])
      }
    })

    this.patterns = Array.from(uniquePatterns.entries()).map(([placeholder, fullMatch]) => ({
      fullMatch,
      placeholder,
      value: "",
    }))

    // Tạo các input cho pattern
    this.createPatternInputs()

    // Cập nhật output
    this.updateOutput()
  }

  private createPatternInputs(): void {
    // Xóa tất cả input cũ
    this.patternsContainer.innerHTML = ""

    if (this.patterns.length === 0) {
      this.patternsContainer.innerHTML =
        '<p style="color: #666; font-style: italic;">Không tìm thấy pattern nào</p>'
      return
    }

    // Tạo input cho mỗi pattern
    this.patterns.forEach((pattern, index) => {
      const patternDiv = document.createElement("div")
      patternDiv.className = "pattern-input"

      const label = document.createElement("span")
      label.className = "pattern-label"
      label.textContent = pattern.placeholder

      const input = document.createElement("input")
      input.type = "text"
      input.placeholder = `Nhập giá trị cho: ${pattern.placeholder}`
      input.value = pattern.value

      // Xử lý sự kiện input và enter
      input.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement
        pattern.value = target.value
        this.updateOutput()
      })

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.updateOutput()
          this.copyToClipboard()
        }
      })

      patternDiv.appendChild(label)
      patternDiv.appendChild(input)
      this.patternsContainer.appendChild(patternDiv)
    })
  }

  private updateOutput(): void {
    let result = this.originalText

    // Thay thế tất cả các pattern giống nhau cùng lúc
    this.patterns.forEach((pattern) => {
      if (pattern.value.trim()) {
        // Sử dụng regex để thay thế tất cả các pattern giống nhau
        const replaceRegex = new RegExp(
          pattern.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "g"
        )
        result = result.replace(replaceRegex, pattern.value)
      }
    })

    this.outputTextarea.value = result
  }

  private async copyToClipboard(): Promise<void> {
    const finalOutput = this.outputTextarea.value
    if (!finalOutput) {
      toaster.show("Không có kết quả để copy!", "warning")
      return
    }
    try {
      await navigator.clipboard.writeText(finalOutput)
      toaster.show("Đã copy kết quả vào clipboard!", "success")
    } catch (err) {
      // Fallback cho các trình duyệt cũ
      this.outputTextarea.select()
      try {
        document.execCommand("copy")
      } catch (error) {
        toaster.show("Lỗi không copy được vào clipboard!", "error")
      }
      toaster.show("Đã copy kết quả vào clipboard!", "success")
    }
  }
}

// Khởi tạo ứng dụng khi DOM đã sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
  new App()
})
