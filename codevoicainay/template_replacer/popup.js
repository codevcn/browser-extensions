const replaceButton = document.getElementById("replace-button")
const inputText = document.getElementById("input-text-textarea")
const replaceText = document.getElementById("replace-text-input")
const templatePattern = document.getElementById("template-pattern-input")
const toaster = document.getElementById("toaster")

const toast = (msg, type) => {
  toaster.textContent = msg
  toaster.classList.remove("success", "error", "warning")
  requestAnimationFrame(() => {
    toaster.classList.add(type)
  })
}

const replaceTextHandler = () => {
  const inputValue = inputText.value
  const replaceValue = replaceText.value
  const pattern = /{{[^}]*}}/g

  // Replace template {{...}} with the replace value
  const template = inputValue.match(pattern)
  if (!template) {
    toast("No template found", "warning")
    return
  }
  const result = inputValue.replace(pattern, replaceValue)

  // Copy to clipboard
  navigator.clipboard
    .writeText(result)
    .then(() => {
      inputText.value = result
      toast("Text replaced and copied to clipboard!", "success")
    })
    .catch(() => {
      toast("Error: Failed to copy text to clipboard", "error")
    })
}

const init = () => {
  inputText.focus()

  replaceButton.addEventListener("click", replaceTextHandler)

  // catch enter key
  replaceText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      replaceButton.click()
    }
  })

  // Handle hover state for toaster
  toaster.addEventListener("mouseenter", () => {
    toaster.classList.add("paused")
  })
  toaster.addEventListener("mouseleave", () => {
    toaster.classList.remove("paused")
  })
}
init()
