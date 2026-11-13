import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import TicketTypeConfigEditor from './TicketTypeConfigEditor'
import { DEFAULT_CONFIG, type TicketTypeConfig, type TicketTypeDef } from '../../data/ticketTypes'
import { useWorkflow } from '../../state/WorkflowContext'
import { useAuth } from '../../auth/AuthContext'
import { dialogPaperSx } from '../../theme/hud'

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

interface WorkflowSettingsDialogProps {
  open: boolean
  onClose: () => void
  /** The ticket type of the ticket being viewed, edited or created. */
  selectedTypeKey: string | null
  /** Picks the ticket type of a ticket that is being created. Omitted for existing tickets. */
  onSelectType?: (typeKey: string) => void
}

type Selection = { kind: 'type'; key: string } | { kind: 'new' }

export default function WorkflowSettingsDialog({ open, onClose, selectedTypeKey, onSelectType }: WorkflowSettingsDialogProps) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const { currentUser } = useAuth()
  const { ticketTypes, typesAvailable, loading, saveTicketType, deleteTicketType } = useWorkflow()
  const canAdminister = currentUser?.role === 'Administrator'
  const [selection, setSelection] = useState<Selection>({ kind: 'type', key: selectedTypeKey ?? ticketTypes[0]?.key ?? '' })
  const [showDetail, setShowDetail] = useState(!isXs)
  const [editorVersion, setEditorVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<TicketTypeDef | null>(null)

  const systemTypes = ticketTypes.filter((type) => type.isSystem)
  const customTypes = ticketTypes.filter((type) => !type.isSystem)
  const current = selection.kind === 'type' ? (ticketTypes.find((type) => type.key === selection.key) ?? null) : null
  const creating = selection.kind === 'new'

  const editable = canAdminister && typesAvailable && Boolean(current) && !current?.isSystem && Boolean(current?.workflowTemplateId) && Boolean(current?.config)

  const close = () => {
    if (busy) return
    setFailure(null)
    onClose()
  }

  const choose = (next: Selection) => {
    if (busy) return
    setSelection(next)
    setFailure(null)
    setShowDetail(true)
    setEditorVersion((value) => value + 1)
  }

  const resetEditor = () => {
    setFailure(null)
    setEditorVersion((value) => value + 1)
    if (isXs) setShowDetail(false)
  }

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setFailure(null)
    try {
      await task()
    } catch (error) {
      console.error('Flow configuration action failed:', error)
      setFailure(failureMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const save = (name: string, description: string, config: TicketTypeConfig) =>
    void run(async () => {
      const key = await saveTicketType(current?.key ?? null, name, description, config)
      if (key) setSelection({ kind: 'type', key })
      setEditorVersion((value) => value + 1)
    })

  const confirmDelete = () => {
    if (!deleting) return
    const target = deleting
    void run(async () => {
      await deleteTicketType(target.key)
      setDeleting(null)
      setSelection({ kind: 'type', key: selectedTypeKey ?? ticketTypes[0]?.key ?? '' })
      setEditorVersion((value) => value + 1)
    })
  }

  const renderType = (type: TicketTypeDef) => {
    const isViewed = selection.kind === 'type' && selection.key === type.key
    const isTicketType = selectedTypeKey === type.key
    return (
      <Box
        key={type.key}
        component="button"
        type="button"
        onClick={() => choose({ kind: 'type', key: type.key })}
        aria-current={isViewed ? 'true' : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          textAlign: 'left',
          font: 'inherit',
          color: 'text.primary',
          cursor: 'pointer',
          bgcolor: isViewed ? 'action.selected' : 'transparent',
          border: 1,
          borderColor: isViewed ? 'primary.main' : 'divider',
          borderRadius: '12px',
          px: 1.25,
          py: 1,
          '&:hover': { bgcolor: 'action.hover' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          {type.label}
        </Typography>
        {isTicketType && <CheckCircleRoundedIcon color="primary" fontSize="small" titleAccess="This ticket" />}
        {type.isSystem && <LockOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} titleAccess="System type" />}
      </Box>
    )
  }

  const renderSection = (id: string, title: string, items: TicketTypeDef[], action?: React.ReactNode) => (
    <Box component="section" aria-labelledby={id}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 30, mb: 1 }}>
        <Typography id={id} variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {title}
        </Typography>
        <Chip size="small" variant="outlined" label={items.length} />
        {action}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{items.map(renderType)}</Box>
    </Box>
  )

  const listPane = (
    <Box
      sx={{
        width: { xs: '100%', sm: 280 },
        flexShrink: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: { xs: 1.5, sm: 2 },
        borderRight: { sm: 1 },
        borderColor: 'divider',
      }}
    >
      {renderSection('system-types-heading', 'System Ticket Types', systemTypes)}
      {renderSection(
        'custom-types-heading',
        'Custom Ticket Types',
        customTypes,
        canAdminister && typesAvailable ? (
          <Button size="small" startIcon={<AddRoundedIcon />} disabled={busy} onClick={() => choose({ kind: 'new' })}>
            Create
          </Button>
        ) : undefined,
      )}
      {customTypes.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ border: 1, borderColor: 'divider', borderStyle: 'dashed', borderRadius: '12px', p: 1.5, mt: -1 }}>
          No custom ticket types yet.
        </Typography>
      )}
    </Box>
  )

  const controls = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: { xs: 1.5, sm: 2 }, pt: 1.5 }}>
      {isXs && (
        <Box>
          <Button size="small" startIcon={<ArrowBackRoundedIcon />} onClick={() => setShowDetail(false)}>
            Ticket types
          </Button>
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
          {creating ? 'New ticket type' : (current?.label ?? 'Ticket type')}
        </Typography>
        {current && selectedTypeKey === current.key && <Chip size="small" color="primary" icon={<CheckCircleRoundedIcon />} label="This ticket" />}
        {current?.isSystem && <Chip size="small" variant="outlined" icon={<LockOutlinedIcon />} label="System" />}
        <Box sx={{ flex: 1 }} />
        {onSelectType && current && selectedTypeKey !== current.key && (
          <Button size="small" variant="contained" disabled={busy} onClick={() => onSelectType(current.key)}>
            Use for this ticket
          </Button>
        )}
        {editable && current && (
          <Button size="small" color="error" startIcon={<DeleteOutlineRoundedIcon />} disabled={busy} onClick={() => setDeleting(current)}>
            Delete
          </Button>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {onSelectType
          ? 'The new ticket starts on the workflow of the ticket type you choose.'
          : 'Tickets keep the workflow they started with. Changes here apply to tickets created later.'}
      </Typography>
      {!typesAvailable && !loading && (
        <Alert severity="warning" variant="outlined">
          Custom ticket types need the latest database migration (supabase/ticket_workflow.sql). Built-in types use the default workflow until then.
        </Alert>
      )}
      {typesAvailable && !canAdminister && (
        <Alert severity="info" variant="outlined">
          Only administrators can create or change custom ticket types. You can view how each one is configured.
        </Alert>
      )}
    </Box>
  )

  const detailPane = (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {controls}
      {creating || current ? (
        <TicketTypeConfigEditor
          key={`${creating ? 'new' : current?.key}-${editorVersion}`}
          initialName={creating ? '' : (current?.label ?? '')}
          initialDescription={creating ? '' : (current?.description ?? '')}
          initialConfig={creating ? DEFAULT_CONFIG : (current?.config ?? null)}
          readOnly={creating ? !canAdminister : !editable}
          saving={busy}
          error={failure}
          onCancel={resetEditor}
          onSave={save}
        />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          {loading ? 'Loading…' : 'No workflow is configured for this ticket type.'}
        </Typography>
      )}
    </Box>
  )

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        fullWidth
        fullScreen={isXs}
        maxWidth="lg"
        sx={{ zIndex: (t) => t.zIndex.modal + 30 }}
        slotProps={{ paper: { sx: { ...dialogPaperSx, height: isXs ? '100%' : 'min(640px, 86dvh)' } } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5, pr: 1 }}>
          <Typography variant="h6" component="span" sx={{ flex: 1, minWidth: 0 }}>
            Flow Configuration
          </Typography>
          <IconButton size="small" onClick={close} aria-label="Close">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', borderTop: 1, borderColor: 'divider' }}>
          {(!isXs || !showDetail) && listPane}
          {(!isXs || showDetail) && detailPane}
        </Box>
      </Dialog>

      <Dialog open={Boolean(deleting)} onClose={() => !busy && setDeleting(null)} maxWidth="xs" fullWidth sx={{ zIndex: (t) => t.zIndex.modal + 40 }}>
        <DialogTitle>Delete ticket type?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleting ? `Delete "${deleting.label}" and its workflow? Types that tickets still use cannot be deleted.` : ''}
          </DialogContentText>
          {failure && deleting && (
            <Typography role="alert" variant="body2" color="error" sx={{ mt: 1.5, wordBreak: 'break-word' }}>
              {failure}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
