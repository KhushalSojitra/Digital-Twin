import type { KeyboardEvent } from 'react'

/**
 * Keeps "Enter posts the comment" now that the field is a textarea: Shift+Enter adds a new line,
 * and Enter is left alone while the @mention list or an IME is using it.
 */
export function enterToSubmit(inner?: (e: KeyboardEvent<HTMLElement>) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    inner?.(e)
    if (e.defaultPrevented || e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
    const field = e.target
    if (!(field instanceof HTMLTextAreaElement) || !field.form) return
    e.preventDefault()
    field.form.requestSubmit()
  }
}
