import { useRef, useState, type DragEvent } from 'react'
import { alpha, Box, Button, ButtonBase, Divider, IconButton, Popover, Typography, type Theme } from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import { formatSize, kindOf, type Attachment, type AttachmentsState } from './attachments'

interface Props {
  anchorEl: HTMLElement | null
  onClose: () => void
  attachments: AttachmentsState
  onPreview: (attachment: Attachment) => void
}

function Thumb({ attachment }: { attachment: Attachment }) {
  const kind = kindOf(attachment.file)
  if (kind === 'image') {
    return <Box component="img" src={attachment.url} alt="" sx={{ width: 44, height: 44, borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
  }
  const tint = kind === 'pdf' ? '#ef4444' : kind === 'video' ? '#2563eb' : '#64748b'
  const Icon = kind === 'pdf' ? PictureAsPdfRoundedIcon : kind === 'video' ? PlayArrowRoundedIcon : InsertDriveFileRoundedIcon
  return (
    <Box aria-hidden sx={{ width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '8px', color: tint, bgcolor: alpha(tint, 0.14) }}>
      <Icon />
    </Box>
  )
}

export default function AttachmentPopover({ anchorEl, onClose, attachments, onPreview }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const { items, error, add, remove } = attachments
  const pick = () => input.current?.click()

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    add(e.dataTransfer.files)
  }

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ zIndex: (t: Theme) => t.zIndex.modal + 10 }}
      slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 32px)', mt: 1, p: 2, borderRadius: '16px' } } }}
    >
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{items.length === 0 ? 'Attach files' : `Attachments (${items.length})`}</Typography>
        {items.length === 0 ? (
          <IconButton size="small" onClick={onClose} aria-label="Close attachments">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        ) : (
          <Button size="small" startIcon={<AddRoundedIcon />} onClick={pick} sx={{ fontWeight: 700 }}>
            Add Files
          </Button>
        )}
      </Box>

      {items.length === 0 ? (
        <>
          <ButtonBase
            onClick={pick}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            sx={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 1.5,
              p: 1.75,
              textAlign: 'left',
              borderRadius: '12px',
              border: '1.5px dashed',
              borderColor: dragging ? 'primary.main' : (t: Theme) => alpha(t.palette.text.primary, 0.3),
              bgcolor: dragging ? (t: Theme) => alpha(t.palette.primary.main, 0.08) : 'transparent',
            }}
          >
            <Box aria-hidden sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: '50%', color: 'primary.main', bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.14) }}>
              <InsertDriveFileRoundedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'primary.main' }}>Choose files</Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                Select one or more files (all formats)
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                Max 10 MB per file · Up to 10 files
              </Typography>
            </Box>
          </ButtonBase>
          <Divider sx={{ my: 1.5, color: 'text.secondary', fontSize: 13 }}>or</Divider>
          <Button fullWidth variant="outlined" color="inherit" startIcon={<FolderOpenRoundedIcon />} onClick={pick} sx={{ borderRadius: '10px', fontWeight: 700 }}>
            Browse Files
          </Button>
        </>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 260, overflowY: 'auto' }}>
          {items.map((item) => (
            <Box component="li" key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderTop: 1, borderColor: 'divider' }}>
              <ButtonBase
                onClick={() => onPreview(item)}
                aria-label={`Preview ${item.file.name}`}
                sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1.5, py: 1, textAlign: 'left' }}
              >
                <Thumb attachment={item} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
                    {item.file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatSize(item.file.size)}
                  </Typography>
                </Box>
              </ButtonBase>
              <IconButton size="small" onClick={() => remove(item.id)} aria-label={`Remove ${item.file.name}`}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {error && (
        <Typography role="alert" color="error" variant="caption" component="div" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Popover>
  )
}
