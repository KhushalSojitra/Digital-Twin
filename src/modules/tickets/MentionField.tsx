import { useId, useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react'
import { Avatar, Box, List, ListItemButton, ListItemAvatar, ListItemText, Paper, Popper, type SxProps, type Theme } from '@mui/material'
import { ASSIGNEES } from '../../data/tickets'
import { initials } from '../../utils/format'
import { activeMention, matchesQuery } from './mentions'

export interface MentionFieldProps {
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
  onSelect: (e: SyntheticEvent<HTMLElement>) => void
  /** Spread onto the real <input> so assistive technology announces the suggestion list. */
  inputAria: {
    role: 'combobox'
    'aria-autocomplete': 'list'
    'aria-expanded': boolean
    'aria-controls'?: string
    'aria-activedescendant'?: string
  }
}

interface Props {
  value: string
  onValueChange: (value: string) => void
  people?: readonly string[]
  disabled?: boolean
  sx?: SxProps<Theme>
  children: (field: MentionFieldProps) => ReactNode
}

/** Wraps a text input and suggests people when the user types `@`. */
export default function MentionField({ value, onValueChange, people = ASSIGNEES, disabled, sx, children }: Props) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const listId = useId()

  const active = useMemo(() => activeMention(value, caret), [value, caret])
  const options = useMemo(() => (active ? people.filter((person) => matchesQuery(person, active.query)) : []), [active, people])
  const open = !disabled && !dismissed && options.length > 0
  const current = Math.min(highlight, Math.max(options.length - 1, 0))
  const optionId = (index: number) => `${listId}-${index}`

  const choose = (person: string) => {
    if (!active) return
    const before = value.slice(0, active.start)
    const after = value.slice(caret)
    const next = `${before}@${person} ${after.startsWith(' ') ? after.slice(1) : after}`
    const position = before.length + person.length + 2
    onValueChange(next)
    setCaret(position)
    setHighlight(0)
    requestAnimationFrame(() => {
      const input = anchor?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
      input?.focus()
      input?.setSelectionRange(position, position)
    })
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onValueChange(e.target.value)
    setCaret(e.target.selectionStart ?? e.target.value.length)
    setHighlight(0)
    setDismissed(false)
  }

  const handleSelect = (e: SyntheticEvent<HTMLElement>) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    if (typeof target.selectionStart === 'number') setCaret(target.selectionStart)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!open || e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((current + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((current - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      choose(options[current])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setDismissed(true)
    }
  }

  return (
    <Box ref={setAnchor} sx={sx}>
      {children({
        value,
        onChange: handleChange,
        onKeyDown: handleKeyDown,
        onSelect: handleSelect,
        inputAria: {
          role: 'combobox',
          'aria-autocomplete': 'list',
          'aria-expanded': open,
          'aria-controls': open ? listId : undefined,
          'aria-activedescendant': open ? optionId(current) : undefined,
        },
      })}
      <Popper open={open} anchorEl={anchor} placement="top-start" sx={{ zIndex: (t) => t.zIndex.modal + 20 }}>
        <Paper elevation={8} sx={{ mb: 1, minWidth: 220, maxWidth: 300, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
          <List id={listId} role="listbox" aria-label="Mention a person" dense disablePadding sx={{ py: 0.5 }}>
            {options.map((person, index) => (
              <ListItemButton
                key={person}
                id={optionId(index)}
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
