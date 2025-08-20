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

    // Tạo danh sách pattern mới
    this.patterns = matches.map((match, index) => ({
      fullMatch: match[0],
      placeholder: match[1].trim(),
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
          // Tự động focus vào input tiếp theo
          const nextInput = input.parentElement?.nextElementSibling?.querySelector("input")
          if (nextInput) {
            nextInput.focus()
          }
        }
      })

      patternDiv.appendChild(label)
      patternDiv.appendChild(input)
      this.patternsContainer.appendChild(patternDiv)
    })
  }

  private updateOutput(): void {
    let result = this.originalText

    // Thay thế từng pattern
    this.patterns.forEach((pattern) => {
      if (pattern.value.trim()) {
        result = result.replace(pattern.fullMatch, pattern.value)
      }
    })

    this.outputTextarea.value = result
  }

  private async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.outputTextarea.value)
      toaster.show("Đã copy kết quả vào clipboard!", "success")
    } catch (err) {
      // Fallback cho các trình duyệt cũ
      this.outputTextarea.select()
      document.execCommand("copy")
      toaster.show("Đã copy kết quả vào clipboard!", "success")
    }
  }
}

// Khởi tạo ứng dụng khi DOM đã sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
  new App()
})
