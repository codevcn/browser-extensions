enum EShortcuts {
  OPEN_PROMPTS = "o",
}

interface Pattern {
  fullMatch: string
  placeholder: string
  value: string
}

interface PromptItem {
  id: string
  description: string
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
  private textPlaceholderTextarea: HTMLTextAreaElement
  private openPromptsBtn: HTMLButtonElement
  private promptsModal: HTMLDivElement
  private closeBtn: HTMLSpanElement
  private promptsList: HTMLDivElement
  private loadedPrompts: PromptItem[] = []
  private selectedPromptIndex: number = -1
  private patterns: Pattern[] = []
  private originalText: string = ""
  private readonly TEXT_PLACEHOLDER_STR_KEY = "text-placeholder"
  private timeoutFlag: number | undefined = undefined

  constructor() {
    this.inputTextarea = document.getElementById("input-textarea") as HTMLTextAreaElement
    this.outputTextarea = document.getElementById("output-textarea") as HTMLTextAreaElement
    this.patternsContainer = document.getElementById("patterns-container") as HTMLDivElement
    this.copyButton = document.getElementById("copy-button") as HTMLButtonElement
    this.textPlaceholderTextarea = document.querySelector(
      ".text-placeholder",
    ) as HTMLTextAreaElement
    this.openPromptsBtn = document.getElementById("open-prompts-btn") as HTMLButtonElement
    this.promptsModal = document.getElementById("prompts-modal") as HTMLDivElement
    this.closeBtn = document.querySelector(".close-btn") as HTMLSpanElement
    this.promptsList = document.getElementById("prompts-list") as HTMLDivElement

    this.bindEvents()
    this.focusOnAppStarted()
    this.fillTextPlaceholder()
  }

  private fillTextPlaceholder(): void {
    chrome.storage.local.get([this.TEXT_PLACEHOLDER_STR_KEY], (result) => {
      console.log(">>> fillTextPlaceholder:", result)
      this.textPlaceholderTextarea.value = result[this.TEXT_PLACEHOLDER_STR_KEY] || ""
    })
  }

  private onEditTextPlaceholder(): void {
    clearTimeout(this.timeoutFlag)
    this.timeoutFlag = setTimeout(() => {
      const text = this.textPlaceholderTextarea.value
      chrome.storage.local.set({ [this.TEXT_PLACEHOLDER_STR_KEY]: text }, () => {})
    }, 300)
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

    // Xử lý sự kiện nhập text placeholder
    this.textPlaceholderTextarea.addEventListener("input", () => {
      this.onEditTextPlaceholder()
    })

    // Xử lý sự kiện mở danh sách prompt
    this.openPromptsBtn.addEventListener("click", () => {
      this.promptsModal.classList.remove("hidden")
      this.loadPrompts()
    })

    // Xử lý sự kiện đóng danh sách prompt
    this.closeBtn.addEventListener("click", () => {
      this.promptsModal.classList.add("hidden")
    })

    // Đóng modal khi click ra ngoài vùng content
    this.promptsModal.addEventListener("click", (e) => {
      if (e.target === this.promptsModal) {
        this.promptsModal.classList.add("hidden")
      }
    })

    // Xử lý phím tắt
    document.addEventListener("keydown", (e) => {
      // Alt + L để bật/tắt modal prompts
      if (e.altKey && e.key.toLowerCase() === EShortcuts.OPEN_PROMPTS) {
        e.preventDefault()
        if (this.promptsModal.classList.contains("hidden")) {
          this.promptsModal.classList.remove("hidden")
          this.loadPrompts()
        }
        return
      }

      // Xử lý điều hướng trong modal nếu modal đang mở
      if (!this.promptsModal.classList.contains("hidden") && this.loadedPrompts.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          if (this.selectedPromptIndex === this.loadedPrompts.length - 1) {
            this.selectedPromptIndex = 0
          } else {
            this.selectedPromptIndex++
          }
          this.updatePromptSelection()
        } else if (e.key === "ArrowUp") {
          e.preventDefault()
          if (this.selectedPromptIndex <= 0) {
            this.selectedPromptIndex = this.loadedPrompts.length - 1
          } else {
            this.selectedPromptIndex--
          }
          this.updatePromptSelection()
        } else if (e.key === "Enter") {
          e.preventDefault()
          if (
            this.selectedPromptIndex >= 0 &&
            this.selectedPromptIndex < this.loadedPrompts.length
          ) {
            this.selectPrompt(this.loadedPrompts[this.selectedPromptIndex])
          }
        } else if (e.key === "Escape") {
          this.promptsModal.classList.add("hidden")
        }
      }
    })
  }

  private async loadPrompts(): Promise<void> {
    if (this.loadedPrompts.length > 0) {
      this.renderPrompts()
      return
    }

    this.promptsList.innerHTML = '<div class="loading-text">Đang tải...</div>'
    const prompts: PromptItem[] = []
    let index = 1

    while (true) {
      try {
        const url = chrome.runtime.getURL(`prompts/prompt-${index}.txt`)
        const response = await fetch(url)
        if (!response.ok) break
        const text = await response.text()
        const parsedPrompts = this.parsePromptsText(text)
        prompts.push(...parsedPrompts)
        index++
      } catch (e) {
        // Chrome fetch throws TypeError: Failed to fetch if local file doesn't exist.
        // Cuối danh sách (ví dụ đến 3.txt không có), lỗi này ném ra là bình thường.
        break
      }
    }

    this.loadedPrompts = prompts
    this.renderPrompts()
  }

  private parsePromptsText(text: string): PromptItem[] {
    const results: PromptItem[] = []
    const regex = /@@\[(.*?)\]<<<\s*description:\s*<<\s*(.*?)\s*>>\s*value:\s*<<([\s\S]*?)>>\s*>>>/g
    let match
    while ((match = regex.exec(text)) !== null) {
      results.push({
        id: match[1].trim(),
        description: match[2].trim(),
        value: match[3].trim(),
      })
    }
    return results
  }

  private renderPrompts(): void {
    this.promptsList.innerHTML = ""

    if (this.loadedPrompts.length === 0) {
      this.promptsList.innerHTML = '<div class="loading-text">Không tìm thấy prompt nào.</div>'
      return
    }

    this.loadedPrompts.forEach((p) => {
      const item = document.createElement("div")
      item.className = "prompt-item"

      const desc = document.createElement("div")
      desc.className = "prompt-desc"
      desc.textContent = p.description

      const val = document.createElement("div")
      val.className = "prompt-value"
      val.textContent = p.value

      item.appendChild(desc)
      item.appendChild(val)

      item.addEventListener("click", () => {
        this.selectPrompt(p)
      })

      this.promptsList.appendChild(item)
    })

    this.selectedPromptIndex = -1
  }

  private selectPrompt(p: PromptItem): void {
    this.inputTextarea.value = p.value
    this.promptsModal.classList.add("hidden")
    this.analyzePatterns()
  }

  private updatePromptSelection(): void {
    const items = this.promptsList.querySelectorAll(".prompt-item")
    items.forEach((item, index) => {
      if (index === this.selectedPromptIndex) {
        item.classList.add("selected")
        ;(item as HTMLElement).scrollIntoView({ block: "nearest" })
      } else {
        item.classList.remove("selected")
      }
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
        '<p style="color: #666; font-style: italic; font-size: 12px">Không tìm thấy pattern nào</p>'
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
      input.placeholder = `${pattern.placeholder}`
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
          "g",
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
