import { useEffect, useRef, useState } from 'react'
import { alpha, Box, ButtonBase, CircularProgress, Dialog, IconButton, Link, Typography, type Theme } from '@mui/material'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'
import FitScreenRoundedIcon from '@mui/icons-material/FitScreenRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import { formatSize, KIND_LABEL, kindOf, type Attachment } from './attachments'

const PAGE_SCALE = 1.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function PageThumb({ doc, number, active, onSelect }: { doc: PDFDocumentProxy; number: number; active: boolean; onSelect: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null
    doc.getPage(number).then((page) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const viewport = page.getViewport({ scale: 0.22 })
      canvas.width = viewport.width
      canvas.height = viewport.height
      task = page.render({ canvas, viewport })
      task.promise.catch(() => undefined)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, number])

  return (
    <ButtonBase
      onClick={onSelect}
      aria-label={`Go to page ${number}`}
      aria-current={active}
      sx={{ flexDirection: 'column', gap: 0.5, width: '100%', flexShrink: 0 }}
    >
      <Box
        component="canvas"
        ref={canvasRef}
        sx={{ display: 'block', maxWidth: '100%', bgcolor: '#fff', borderRadius: '6px', border: 2, borderColor: active ? 'primary.main' : 'divider' }}
      />
      <Typography variant="caption" color="text.secondary">
        {number}
      </Typography>
    </ButtonBase>
  )
}

function PdfViewer({ attachment }: { attachment: Attachment }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const data = new Uint8Array(await attachment.file.arrayBuffer())
        if (cancelled) return
        loadingTask = pdfjs.getDocument({ data })
        const loaded = await loadingTask.promise
        if (cancelled) return
        setDoc(loaded)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [attachment.file])

  const fitWidth = async () => {
    const stage = stageRef.current
    if (!doc || !stage) return
    const first = await doc.getPage(page)
    const width = first.getViewport({ scale: 1 }).width * PAGE_SCALE
    setZoom(clampZoom((stage.clientWidth - 48) / width))
  }

  useEffect(() => {
    if (status === 'ready') void fitWidth()
    // Fit once when the document first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null
    doc.getPage(page).then((pdfPage) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const dpr = window.devicePixelRatio || 1
      const viewport = pdfPage.getViewport({ scale: zoom * PAGE_SCALE * dpr })
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`
      task = pdfPage.render({ canvas, viewport })
      task.promise.catch(() => undefined)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, page, zoom])

  if (status === 'loading') {
    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={28} aria-label="Loading document" />
      </Box>
    )
  }
  if (status === 'error' || !doc) {
    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3 }}>
        <Typography color="text.secondary">This PDF could not be previewed.</Typography>
      </Box>
    )
  }

  const goTo = (value: number) => setPage(Math.min(doc.numPages, Math.max(1, value)))
  const pill = { height: 36, borderRadius: '8px', border: 1, borderColor: 'divider', px: 1.5, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 } as const

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1.5, p: 1.5, bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.05) }}>
      <Box sx={{ width: 110, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5, pr: 0.5 }}>
        {Array.from({ length: doc.numPages }, (_, i) => (
          <PageThumb key={i} doc={doc} number={i + 1} active={page === i + 1} onSelect={() => goTo(i + 1)} />
        ))}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="input"
            type="number"
            min={1}
            max={doc.numPages}
            value={page}
            aria-label="Page number"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const next = Number(e.target.value)
              if (Number.isFinite(next)) goTo(next)
            }}
            sx={{ ...pill, width: 56, px: 1, textAlign: 'center', color: 'primary.main', bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.12), borderColor: 'transparent' }}
          />
          <Typography color="text.secondary" sx={{ fontSize: 14 }}>{`/ ${doc.numPages}`}</Typography>
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" aria-label="Zoom out" onClick={() => setZoom((z) => clampZoom(z - 0.1))}>
            <RemoveRoundedIcon fontSize="small" />
          </IconButton>
          <Box sx={{ ...pill, minWidth: 64, justifyContent: 'center' }}>{`${Math.round(zoom * 100)}%`}</Box>
          <IconButton size="small" aria-label="Zoom in" onClick={() => setZoom((z) => clampZoom(z + 0.1))}>
            <AddRoundedIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label="Fit to width" onClick={() => void fitWidth()}>
            <FitScreenRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box ref={stageRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', justifyContent: 'safe center', p: 1.5 }}>
          <Box component="canvas" ref={canvasRef} sx={{ display: 'block', flexShrink: 0, bgcolor: '#fff', boxShadow: 2, alignSelf: 'flex-start' }} />
        </Box>
      </Box>
    </Box>
  )
}

function KindBadge({ kind }: { kind: ReturnType<typeof kindOf> }) {
  const tint = kind === 'pdf' ? '#ef4444' : kind === 'video' ? '#2563eb' : kind === 'image' ? '#16a34a' : '#64748b'
  const Icon = kind === 'pdf' ? PictureAsPdfRoundedIcon : kind === 'video' ? PlayArrowRoundedIcon : kind === 'image' ? ImageRoundedIcon : InsertDriveFileRoundedIcon
  return (
    <Box aria-hidden sx={{ width: 48, height: 48, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '12px', color: tint, bgcolor: alpha(tint, 0.14) }}>
      <Icon />
    </Box>
  )
}

interface Props {
  attachment: Attachment | null
  onClose: () => void
}

export default function DocumentPreview({ attachment, onClose }: Props) {
  const kind = attachment ? kindOf(attachment.file) : 'other'

  return (
    <Dialog
      open={Boolean(attachment)}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      sx={{ zIndex: (t: Theme) => t.zIndex.modal + 30 }}
      slotProps={{ paper: { sx: { height: 'min(640px, 88dvh)', m: 2, borderRadius: '16px', overflow: 'hidden' } } }}
    >
      {attachment && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'divider' }}>
            <KindBadge kind={kind} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap component="h2" sx={{ fontSize: 18, fontWeight: 800 }}>
                {attachment.file.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {`${formatSize(attachment.file.size)} · ${KIND_LABEL[kind]}`}
              </Typography>
            </Box>
            <Link
              href={attachment.url}
              download={attachment.file.name}
              underline="none"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 700, fontSize: 14, color: 'text.primary', px: 1 }}
            >
              <DownloadRoundedIcon fontSize="small" color="primary" />
              Download
            </Link>
            <Box aria-hidden sx={{ width: '1px', height: 28, flexShrink: 0, bgcolor: 'divider' }} />
            <IconButton onClick={onClose} aria-label="Close preview">
              <CloseRoundedIcon />
            </IconButton>
          </Box>

          {kind === 'pdf' ? (
            <PdfViewer key={attachment.id} attachment={attachment} />
          ) : kind === 'image' ? (
            <Box sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', p: 2, bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.05) }}>
              <Box component="img" src={attachment.url} alt={attachment.file.name} sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
            </Box>
          ) : kind === 'video' ? (
            <Box sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', bgcolor: '#000' }}>
              <video src={attachment.url} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
            </Box>
          ) : (
            <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3 }}>
              <Typography color="text.secondary">Preview is not available for this file type. Use Download to open it.</Typography>
            </Box>
          )}
        </>
      )}
    </Dialog>
  )
}
