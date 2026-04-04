declare var chrome: any

// Hàm này được inject vào page nên phải là một function độc lập,
// không được để bên trong class vì Chrome executeScript không đọc được cú pháp method của class.
function extractTranscriptFromPageFunc(): string | null {
  try {
    let mainDiv = document.querySelector('div[id^="transcript-"]')
    console.log(">>> mainDiv:", mainDiv)

    if (!mainDiv) {
      const fallbacks = document.querySelectorAll(".flex.flex-col.space-y-4")
      for (let i = 0; i < fallbacks.length; i++) {
        if (fallbacks[i].querySelector("span.opacity-80")) {
          mainDiv = fallbacks[i] as Element
          break
        }
      }
    }

    if (!mainDiv) {
      const checkSpans = document.querySelectorAll("span.opacity-80")
      if (checkSpans.length > 0) {
        mainDiv = document.body
      } else {
        return "ERROR:_NO_MAIN_DIV_FOUND"
      }
    }

    let textResult = ""
    const segments = mainDiv.querySelectorAll("span.opacity-80")

    if (segments.length === 0) {
      return "ERROR:_NO_SEGMENTS_FOUND"
    }

    segments.forEach((timeSpan) => {
      let parentSpan = timeSpan.parentElement

      let textSpan = null
      let checks = 0
      while (parentSpan && checks < 3) {
        textSpan =
          parentSpan.querySelector(".cursor-pointer > span") ||
          parentSpan.querySelector(".cursor-pointer")
        if (textSpan) break
        parentSpan = parentSpan.parentElement
        checks++
      }

      if (textSpan) {
        let timeText = timeSpan.textContent ? timeSpan.textContent.trim() : ""
        // Thay đổi toàn bộ dấu thời gian từ ngoặc tròn sang ngoặc vuông
        timeText = timeText.replace(/\(([\d:]+)\)/g, "[$1]")

        const contentText = textSpan.textContent ? textSpan.textContent.trim() : ""
        if (timeText && contentText) {
          textResult += `${timeText} ${contentText}\n`
        }
      }
    })

    const result = textResult.trim()
    return result !== "" ? result : "ERROR:_EMPTY_TEXT"
  } catch (e: any) {
    return "ERROR:_EXCEPTION_" + e.message
  }
}

class TurboScribeCopier {
  private static ICONS = {
    pending: "⚪",
    success: "✅",
    error: "❌",
    loading: "⏳",
  }

  private setupContainer: HTMLDivElement
  private statusContainer: HTMLDivElement
  private standardAudioArea: HTMLTextAreaElement
  private startBtn: HTMLButtonElement

  private lrcArea: HTMLTextAreaElement
  private resultsContainer: HTMLDivElement
  private retryBtn: HTMLButtonElement

  constructor() {
    this.setupContainer = document.getElementById("setup-container") as HTMLDivElement
    this.statusContainer = document.getElementById("status-container") as HTMLDivElement
    this.standardAudioArea = document.getElementById("standard-audio-area") as HTMLTextAreaElement
    this.startBtn = document.getElementById("start-btn") as HTMLButtonElement

    this.lrcArea = document.getElementById("lrc-area") as HTMLTextAreaElement
    this.resultsContainer = document.getElementById("results-container") as HTMLDivElement
    this.retryBtn = document.getElementById("retry-btn") as HTMLButtonElement

    this.init()
  }

  private init() {
    this.setupEvents()

    // Focus vào ô nhập liệu
    this.standardAudioArea.focus()

    // Đọc clipboard bằng API hiện đại, chờ cửa sổ focus hoàn toàn để tránh lỗi "NotAllowedError"
    if (document.hasFocus()) {
      this.pasteFromClipboard()
    } else {
      window.addEventListener("focus", () => this.pasteFromClipboard(), { once: true })
    }
  }

  private async pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text && !this.standardAudioArea.value) {
        this.standardAudioArea.value = text
      }
    } catch (err) {
      console.error("Không thể tự động đọc clipboard:", err)
    }
  }

  private setupEvents() {
    this.startBtn.addEventListener("click", this.handleStart.bind(this))
    this.standardAudioArea.addEventListener("keydown", this.handleStandardAudioKeydown.bind(this))
    this.lrcArea.addEventListener("keydown", this.handleTextareaKeydown.bind(this))
    this.retryBtn.addEventListener("click", this.handleRetry.bind(this))
  }

  private async handleStandardAudioKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      await this.handleStart()
    }
  }

  private async handleStart() {
    if (!this.standardAudioArea.value.trim()) {
      alert("Vui lòng dán lời bài hát chuẩn vào trước khi tiếp tục!")
      this.standardAudioArea.focus()
      return
    }

    this.setupContainer.classList.add("hidden")
    this.statusContainer.classList.add("visible")
    await this.startProcess()
  }

  private async handleRetry() {
    this.resetUI()
    // Quay lại màn hình Setup ban đầu
    this.statusContainer.classList.remove("visible")
    this.setupContainer.classList.remove("hidden")
  }

  private resetUI() {
    this.lrcArea.value = ""
    this.resultsContainer.classList.remove("visible")
    this.setStep("domain", "pending", "Đang kiểm tra tên miền...")
    this.setStep("find", "pending", "Chờ tìm transcription...")
    this.setStep("copy", "pending", "Chờ tạo prompt và sao chép...")
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  private setStep(
    step: "domain" | "find" | "copy",
    status: "pending" | "loading" | "success" | "error",
    text?: string,
  ) {
    const el = document.getElementById(`step-${step}`)
    const icon = document.getElementById(`icon-${step}`)
    const textEl = document.getElementById(`text-${step}`)

    if (el) el.className = `status-item ${status}`
    if (icon) icon.textContent = (TurboScribeCopier.ICONS as any)[status]
    if (textEl && text) {
      textEl.textContent = text.length > 50 ? text.substring(0, 47) + "..." : text
      textEl.title = text
    }
  }

  private showLoading(step: "find" | "copy", show: boolean) {
    const bar = document.getElementById(`loading-${step}`)
    if (bar) bar.classList.toggle("visible", show)
  }

  private async getCurrentTab(): Promise<any> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    })
    return tab
  }

  private async handleTextareaKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      try {
        await navigator.clipboard.writeText(this.lrcArea.value)
        this.setStep("copy", "success", "Đã chép lại Prompt thành công!")
        setTimeout(() => {
          this.setStep("copy", "success", "Đã sao chép toàn bộ Prompt vào clipboard!")
        }, 2000)
      } catch (err) {
        console.error("Lỗi khi chép lại:", err)
        this.setStep("copy", "error", "Lỗi chép lại vào clipboard")
      }
    }
  }

  private convertToLRC(text: string): string {
    const lines = text.split("\n")
    let lrcText = ""

    for (const line of lines) {
      if (!line.trim()) continue

      const match = line.match(/^[\[\(]([\d:]+)[\]\)]\s*(.*)/)
      if (match) {
        const timeStr = match[1]
        const content = match[2]

        const parts = timeStr.split(":")
        let minutes = 0
        let seconds = 0

        if (parts.length === 3) {
          minutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
          seconds = parseInt(parts[2], 10)
        } else if (parts.length === 2) {
          minutes = parseInt(parts[0], 10)
          seconds = parseInt(parts[1], 10)
        }

        const minStr = minutes.toString().padStart(2, "0")
        const secStr = seconds.toString().padStart(2, "0")

        lrcText += `[${minStr}:${secStr}.00] ${content}\n`
      } else {
        lrcText += `${line}\n`
      }
    }

    return lrcText.trim()
  }

  private async startProcess() {
    try {
      const tab = await this.getCurrentTab()

      const isDomainValid = await this.checkDomain(tab)
      if (!isDomainValid) return

      const extractionResult = await this.findTranscription(tab)
      if (!extractionResult) return

      // Convert format
      const lrcResult = this.convertToLRC(extractionResult)

      // Inject to Prompt Template
      let promptTemplate = ""
      try {
        const response = await fetch("prompts/fix-LRC.txt")
        promptTemplate = await response.text()
      } catch (err) {
        console.error("Không thể load prompt template:", err)
        this.setStep("copy", "error", "Lỗi không thể tải template prompt")
        return
      }

      const standardText = this.standardAudioArea.value.trim()
      const promptResult = promptTemplate.replace("{{LỜI_CHUẨN_Ở_ĐÂY}}", standardText).replace(
        "{{NỘI_DUNG_LRC_Ở_ĐÂY}}",
        lrcResult,
      )

      await this.copyToClipboard(promptResult)
    } catch (error) {
      console.error("Popup Error:", error)
      this.setStep("domain", "error", "Có lỗi xảy ra: " + String(error))
    }
  }

  private async checkDomain(tab: any): Promise<boolean> {
    this.setStep("domain", "loading", "Đang kiểm tra tên miền...")
    await this.sleep(600)

    if (!tab.url || !tab.url.includes("turboscribe.com")) {
      this.setStep("domain", "error", "Lỗi: Tên miền không hợp lệ (không phải TurboScribe)")
      return false
    }

    this.setStep("domain", "success", "Tên miền TurboScribe hợp lệ")
    return true
  }

  private async findTranscription(tab: any): Promise<string | null> {
    this.setStep("find", "loading", "Đang tìm transcription...")
    this.showLoading("find", true)
    await this.sleep(800)

    let extractionResult: string | null = null
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: extractTranscriptFromPageFunc,
      })

      if (results && results.length > 0) {
        for (const frame of results) {
          if (
            frame.result &&
            typeof frame.result === "string" &&
            !frame.result.startsWith("ERROR:")
          ) {
            extractionResult = frame.result
            break
          }
        }

        if (!extractionResult) {
          extractionResult = results[0].result
        }
      }
    } catch (err) {
      console.error("Lỗi khi chạy script", err)
    }

    this.showLoading("find", false)

    if (
      !extractionResult ||
      (typeof extractionResult === "string" && extractionResult.startsWith("ERROR:"))
    ) {
      this.setStep("find", "error", "Lỗi: " + (extractionResult || "Không nhận được phản hồi"))
      return null
    }

    this.setStep("find", "success", "Đã tìm thấy transcription")
    return extractionResult
  }

  private async copyToClipboard(promptResult: string) {
    this.setStep("copy", "loading", "Đang tạo prompt và sao chép...")
    this.showLoading("copy", true)
    await this.sleep(800)

    try {
      await navigator.clipboard.writeText(promptResult)
      this.showLoading("copy", false)
      this.setStep("copy", "success", "Đã sao chép toàn bộ Prompt vào clipboard!")
      this.showResult(promptResult)
    } catch (err) {
      this.showLoading("copy", false)
      this.setStep("copy", "error", "Lỗi: Không thể sao chép vào clipboard")
      console.error(err)
      this.showResult(promptResult)
    }
  }

  private showResult(promptResult: string) {
    this.lrcArea.value = promptResult
    this.resultsContainer.classList.add("visible")
    this.lrcArea.focus()
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new TurboScribeCopier()
})
