import { ASSIGNEES } from '../../data/tickets'

export interface MentionPart {
  text: string
  mention: boolean
}

/** The `@query` the caret is currently inside, if any. */
export interface ActiveMention {
  /** Index of the `@` character. */
  start: number
  query: string
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function mentionPattern(people: readonly string[]) {
  // Longest names first so "Ann Lee Smith" wins over "Ann Lee".
  const names = [...people].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
  return new RegExp(`(^|\\s)@(${names})(?![\\p{L}\\p{N}_])`, 'giu')
}

function canonicalName(people: readonly string[], typed: string) {
  return people.find((person) => person.toLowerCase() === typed.toLowerCase()) ?? typed
}

/** People mentioned in the text as `@Full Name`, in order of first appearance. */
export function findMentions(text: string, people: readonly string[] = ASSIGNEES): string[] {
  if (people.length === 0 || !text.includes('@')) return []
  const found: string[] = []
  for (const match of text.matchAll(mentionPattern(people))) {
    const name = canonicalName(people, match[2])
    if (!found.includes(name)) found.push(name)
  }
  return found
}

/** Splits text into plain and mention segments so mentions can be styled. */
export function splitMentions(text: string, people: readonly string[] = ASSIGNEES): MentionPart[] {
  if (people.length === 0 || !text.includes('@')) return [{ text, mention: false }]
  const parts: MentionPart[] = []
  let cursor = 0
  for (const match of text.matchAll(mentionPattern(people))) {
    const start = (match.index ?? 0) + match[1].length
    const end = start + 1 + match[2].length
    if (start > cursor) parts.push({ text: text.slice(cursor, start), mention: false })
    parts.push({ text: text.slice(start, end), mention: true })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), mention: false })
  return parts
}

/** Detects an unfinished mention such as `hi @ava` with the caret at the end of it. */
export function activeMention(text: string, caret: number): ActiveMention | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (query.includes('\n') || query.length > 40) return null
  return { start: at, query }
}

/** True when the name, or any word of it, starts with the typed query. */
export function matchesQuery(name: string, query: string) {
  const lower = name.toLowerCase()
  const q = query.toLowerCase()
  return lower.startsWith(q) || lower.split(' ').some((word) => word.startsWith(q))
}
