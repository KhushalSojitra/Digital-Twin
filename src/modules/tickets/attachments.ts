import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import type { CommentAttachment } from '../../data/tickets'

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

const BUCKET = 'ticket-attachments'

/** Uploads picked files to storage so comment attachments survive a reload. */
export async function uploadAttachments(ticketId: string, items: Attachment[]): Promise<CommentAttachment[]> {
  return Promise.all(
    items.map(async ({ file }) => {
      const safeName = file.name.replace(/[^\w.-]+/g, '_')
      const path = `${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
      if (error) throw new Error(`${file.name} could not be uploaded.`)
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      return { name: file.name, size: file.size, type: file.type, url: data.publicUrl }
    }),
  )
}

const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * The bucket is private, so the saved public-style URL returns NoSuchBucket.
 * The object path is recovered from it and exchanged for a short-lived signed URL.
 */
export async function resolveAttachmentUrl(storedUrl: string): Promise<string> {
  const marker = `/${BUCKET}/`
  const index = storedUrl.indexOf(marker)
  if (index === -1) return storedUrl
  const path = decodeURIComponent(storedUrl.slice(index + marker.length).split('?')[0])
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) throw new Error('Attachment could not be accessed.')
  return data.signedUrl
}

/** Rebuilds a previewable attachment from a stored one. */
export async function loadStoredAttachment(stored: CommentAttachment): Promise<Attachment> {
  const response = await fetch(await resolveAttachmentUrl(stored.url))
  if (!response.ok) throw new Error(`${stored.name} could not be loaded.`)
  const blob = await response.blob()
  const file = new File([blob], stored.name, { type: stored.type || blob.type })
  return { id: stored.url, file, url: stored.url }
}
