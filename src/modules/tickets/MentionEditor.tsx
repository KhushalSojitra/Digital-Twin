import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Avatar, Box, List, ListItemButton, ListItemAvatar, ListItemText, Paper, Popper, type SxProps, type Theme } from '@mui/material'
import { ASSIGNEES } from '../../data/tickets'
import { initials } from '../../utils/format'
import { matchesQuery, splitMentions } from './mentions'

interface Props {
  /** Plain text; every mention appears in it as `@Display Name`. */
  value: string
  onValueChange: (value: string) => void
  /** Enter (without Shift) when the suggestion list is closed. */
  onSubmit?: () => void
  people?: readonly string[]
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  ariaLabel?: string
  maxLength?: number
  sx?: SxProps<Theme>
}

const CHIP_ATTR = 'data-mention'

/** Text of the editor's DOM: chips become `@Name`, line breaks become `\n`. */
function serialize(root: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? '').replace(/ /g, ' ')
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.hasAttribute(CHIP_ATTR)) {
      out += `@${node.getAttribute(CHIP_ATTR)}`
      return
    }
    if (node.tagName === 'BR') {
      out += '\n'
      return
    }
    const block = node !== root && (node.tagName === 'DIV' || node.tagName === 'P')
    if (block && out !== '' && !out.endsWith('\n')) out += '\n'
    node.childNodes.forEach(walk)
  }
  walk(root)
  return out
}

function chipElement(name: string): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.setAttribute(CHIP_ATTR, name)
  chip.setAttribute('contenteditable', 'false')
  chip.textContent = `@${name}`
  chip.className = 'mention-chip'
  return chip
}

/** Rebuilds the editor from plain text: known `@Name` mentions become atomic chips. */
function render(root: HTMLElement, text: string, people: readonly string[]) {
  root.replaceChildren()
  for (const part of splitMentions(text, people)) {
    if (part.mention) {
      root.appendChild(chipElement(part.text.slice(1)))
      continue
    }
    part.text.split('\n').forEach((line, index) => {
      if (index > 0) root.appendChild(document.createElement('br'))
      if (line) root.appendChild(document.createTextNode(line))
    })
  }
}

/** The `@query` right before the caret, inside one text node. */
function activeQuery(): { node: Text; start: number; end: number; query: string } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null
  const node = selection.anchorNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const before = (node.textContent ?? '').slice(0, selection.anchorOffset)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (query.includes('\n') || query.length > 40) return null
  return { node: node as Text, start: at, end: selection.anchorOffset, query }
}

function placeCaretAfter(node: Node) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Comment editor whose @mentions are atomic chips: the caret cannot enter a mention, and Backspace or Delete
 * next to one removes the whole chip. The value stays plain text, so the rest of the app is unchanged.
 */
export default function MentionEditor({
  value,
  onValueChange,
  onSubmit,
  people = ASSIGNEES,
  disabled,
  readOnly,
  placeholder,
  ariaLabel = 'Write a comment',
  maxLength = 2000,
  sx,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const lastEmitted = useRef<string>('')
  const [query, setQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  const listId = useId()

  // Outside changes (reset after posting, voice input) rebuild the editor; its own typing does not.
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || value === lastEmitted.current) return
    render(root, value, people)
    lastEmitted.current = value
    if (document.activeElement === root && root.lastChild) placeCaretAfter(root.lastChild)
  }, [value, people])

  const options = useMemo(() => (query === null ? [] : people.filter((person) => matchesQuery(person, query))), [query, people])
  const open = !disabled && options.length > 0
  const current = Math.min(highlight, Math.max(options.length - 1, 0))

  const emit = useCallback(() => {
    const root = ref.current
    if (!root) return
    let text = serialize(root)
    if (text.length > maxLength) {
      text = text.slice(0, maxLength)
      render(root, text, people)
      if (root.lastChild) placeCaretAfter(root.lastChild)
    }
    lastEmitted.current = text
    onValueChange(text)
    setQuery(activeQuery()?.query ?? null)
    setHighlight(0)
  }, [onValueChange, maxLength, people])

  const choose = (person: string) => {
    const active = activeQuery()
    if (!active) return
    const { node, start, end } = active
    const after = node.splitText(start)
    after.textContent = (after.textContent ?? '').slice(end - start)
    const chip = chipElement(person)
    const space = document.createTextNode(' ')
    node.parentNode?.insertBefore(chip, after)
    node.parentNode?.insertBefore(space, after)
    placeCaretAfter(space)
    emit()
    setQuery(null)
  }

  const removeAdjacentChip = (direction: 'back' | 'forward'): boolean => {
    const selection = window.getSelection()
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false
    const { anchorNode, anchorOffset } = selection
    if (!anchorNode) return false
    let neighbour: Node | null = null
    if (anchorNode.nodeType === Node.TEXT_NODE) {
      const atEdge = direction === 'back' ? anchorOffset === 0 : anchorOffset === (anchorNode.textContent ?? '').length
      if (atEdge) neighbour = direction === 'back' ? anchorNode.previousSibling : anchorNode.nextSibling
    } else {
      neighbour = anchorNode.childNodes[direction === 'back' ? anchorOffset - 1 : anchorOffset] ?? null
    }
    if (neighbour instanceof HTMLElement && neighbour.hasAttribute(CHIP_ATTR)) {
      neighbour.remove()
      emit()
      return true
    }
    return false
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((current + 1) % options.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((current - 1 + options.length) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(options[current])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setQuery(null)
        return
      }
    }
    if ((e.key === 'Backspace' && removeAdjacentChip('back')) || (e.key === 'Delete' && removeAdjacentChip('forward'))) {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        document.execCommand('insertLineBreak')
        emit()
      } else {
        onSubmit?.()
      }
    }
  }

  // Paste as plain text only.
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  useEffect(() => {
    const root = ref.current
    if (root) root.setAttribute('contenteditable', disabled || readOnly ? 'false' : 'true')
  }, [disabled, readOnly])

  return (
    <Box ref={anchorRef} sx={[{ position: 'relative', minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Box
        ref={ref}
        role="combobox"
        aria-label={ariaLabel}
        aria-multiline
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={onKeyDown}
        onKeyUp={() => setQuery(activeQuery()?.query ?? null)}
        onClick={() => setQuery(activeQuery()?.query ?? null)}
        onPaste={onPaste}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        sx={(t) => ({
          minHeight: 44,
          maxHeight: 132,
          overflowY: 'auto',
          outline: 'none',
          fontSize: 15,
          lineHeight: 1.45,
          py: 0.25,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          opacity: disabled ? 0.6 : 1,
          '&:empty::before': { content: 'attr(data-placeholder)', color: t.palette.text.disabled, pointerEvents: 'none' },
          '& .mention-chip': {
            display: 'inline-block',
            px: 0.75,
            mx: 0.125,
            borderRadius: '6px',
            fontWeight: 600,
            color: t.palette.primary.main,
            bgcolor: `color-mix(in srgb, ${t.palette.primary.main} 14%, transparent)`,
            userSelect: 'all',
            cursor: 'default',
          },
        })}
      />
      <Popper open={open} anchorEl={anchorRef.current} placement="top-start" sx={{ zIndex: (t) => t.zIndex.modal + 20 }}>
        <Paper elevation={8} sx={{ mb: 1, minWidth: 220, maxWidth: 300, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
          <List id={listId} role="listbox" aria-label="Mention a person" dense disablePadding sx={{ py: 0.5 }}>
            {options.map((person, index) => (
              <ListItemButton
                key={person}
                role="option"
                aria-selected={index === current}
                selected={index === current}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(person)}
                sx={{ gap: 1, py: 0.5 }}
              >
                <ListItemAvatar sx={{ minWidth: 0 }}>
                  <Avatar sx={{ width: 26, height: 26, fontSize: 10.5, fontWeight: 700, bgcolor: 'secondary.main' }}>{initials(person)}</Avatar>
                </ListItemAvatar>
                <ListItemText primary={person} slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 500 } } }} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>
    </Box>
  )
}
