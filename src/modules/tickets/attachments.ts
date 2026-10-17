import { useCallback, useEffect, useRef, useState } from 'react'

export interface Attachment {
  id: string
  file: File
  url: string
}

export type AttachmentKind = 'image' | 'video' | 'pdf' | 'other'

export const MAX_ATTACHMENTS = 10
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export function kindOf(file: File): AttachmentKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf'
  return 'other'
}

export const KIND_LABEL: Record<AttachmentKind, string> = {
  image: 'Image',
  video: 'Video',
  pdf: 'PDF Document',
  other: 'File',
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([])
  const [error, setError] = useState('')
  const urls = useRef<string[]>([])
  const counter = useRef(0)

  useEffect(() => {
    const created = urls.current
    return () => created.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const add = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return
      const next = [...items]
      let message = ''
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          message = `${file.name} is larger than 10 MB.`
          continue
        }
        if (next.length >= MAX_ATTACHMENTS) {
          message = `You can attach up to ${MAX_ATTACHMENTS} files.`
          break
        }
        const url = URL.createObjectURL(file)
        urls.current.push(url)
        counter.current += 1
        next.push({ id: `attachment-${counter.current}`, file, url })
      }
      setItems(next)
      setError(message)
    },
    [items],
  )

  const remove = useCallback((id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return current.filter((item) => item.id !== id)
    })
    setError('')
  }, [])

  return { items, error, add, remove }
}

export type AttachmentsState = ReturnType<typeof useAttachments>
