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
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import WorkflowTemplateEditor from './WorkflowTemplateEditor'
import { emptyDefinition, type WorkflowTemplate } from '../../data/workflows'
import { useWorkflow } from '../../state/WorkflowContext'
import { useAuth } from '../../auth/AuthContext'
import { dialogPaperSx } from '../../theme/hud'

type View = { kind: 'list' } | { kind: 'editor'; template: WorkflowTemplate | null }

function flowSummary(template: WorkflowTemplate) {
  const definition = template.versions[0]?.definition
  if (!definition) return ''
  return definition.states.map((state) => state.label).join(' → ')
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default function WorkflowSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const { currentUser } = useAuth()
  const { templates, activeTemplate, loading, saveTemplate, activateTemplate, deleteTemplate } = useWorkflow()
  const canAdminister = currentUser?.role === 'Administrator'
  const [view, setView] = useState<View>({ kind: 'list' })
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<WorkflowTemplate | null>(null)

  const systemTemplates = templates.filter((template) => template.isSystem)
  const customerTemplates = templates.filter((template) => !template.isSystem)

  const close = () => {
    if (busy) return
    setView({ kind: 'list' })
    setFailure(null)
    onClose()
  }

  const backToList = () => {
    setView({ kind: 'list' })
    setFailure(null)
  }

  const run = async (task: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    setFailure(null)
    try {
      await task()
      after?.()
    } catch (error) {
      console.error('Workflow settings action failed:', error)
      setFailure(failureMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const clone = (template: WorkflowTemplate) => {
    const definition = template.versions[0]?.definition
    if (!definition) return
    void run(() => saveTemplate(null, `${template.name} (Copy)`, template.description, structuredClone(definition)))
  }

  const confirmDelete = () => {
    if (!deleting) return
    const target = deleting
    void run(() => deleteTemplate(target.id), () => setDeleting(null))
  }

  const renderRow = (template: WorkflowTemplate) => {
    const isActive = activeTemplate?.id === template.id
    const editable = canAdminister && !template.isSystem
    return (
      <Box
        key={template.id}
        sx={{
          border: 1,
          borderColor: isActive ? 'primary.main' : 'divider',
          borderRadius: '12px',
          px: 1.25,
          py: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
            {template.name}
          </Typography>
          {isActive && <Chip size="small" color="primary" icon={<CheckCircleRoundedIcon />} label="Active" />}
          {template.isSystem && <Chip size="small" variant="outlined" icon={<LockOutlinedIcon />} label="System" />}
        </Box>
        {template.description && (
          <Typography variant="body2" color="text.secondary">
            {template.description}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {flowSummary(template)}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5, alignItems: 'center' }}>
          {canAdminister && !isActive && (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => void run(() => activateTemplate(template.id))}>
              Activate
            </Button>
          )}
          <Button
            size="small"
            startIcon={editable ? <EditRoundedIcon /> : <VisibilityRoundedIcon />}
            disabled={busy}
            onClick={() => setView({ kind: 'editor', template })}
          >
            {editable ? 'Edit' : 'View'}
          </Button>
          {canAdminister && (
            <Button size="small" startIcon={<ContentCopyRoundedIcon />} disabled={busy} onClick={() => clone(template)}>
              Clone
            </Button>
          )}
          {editable && (
            <Tooltip title={isActive ? 'Activate another workflow before deleting this one' : 'Delete workflow'}>
              <span>
                <Button size="small" color="error" startIcon={<DeleteOutlineRoundedIcon />} disabled={busy || isActive} onClick={() => setDeleting(template)}>
                  Delete
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Box>
    )
  }

  const editing = view.kind === 'editor' ? view.template : null
  const title = view.kind === 'list' ? 'Workflow Settings' : editing ? (editing.isSystem || !canAdminister ? editing.name : `Edit ${editing.name}`) : 'New workflow'

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        fullWidth
        fullScreen={isXs}
        maxWidth="lg"
        slotProps={{ paper: { sx: { ...dialogPaperSx, height: isXs ? '100%' : 'min(640px, 86dvh)' } } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5, pr: 1 }}>
          <Typography variant="h6" component="span" sx={{ flex: 1, minWidth: 0 }}>
            {title}
          </Typography>
          <IconButton size="small" onClick={close} aria-label="Close">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        {view.kind === 'list' ? (
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 2, px: { xs: 1.5, sm: 2 } }}>
            <Box sx={{ borderRadius: '12px', bgcolor: 'action.hover', px: 1.5, py: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Active workflow
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {loading ? 'Loading…' : (activeTemplate?.name ?? 'None')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                New tickets use the active workflow. Existing tickets keep the workflow they were created with.
              </Typography>
            </Box>

            {!canAdminister && (
              <Alert severity="info" variant="outlined">
                Only administrators can change workflows. You can view how each one is configured.
              </Alert>
            )}
            {failure && (
              <Alert severity="error" role="alert" onClose={() => setFailure(null)}>
                {failure}
              </Alert>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: 2,
                alignItems: 'start',
              }}
            >
              <Box component="section" aria-labelledby="system-templates-heading">
                <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 30, mb: 1 }}>
                  <Typography id="system-templates-heading" variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
                    System Templates
                  </Typography>
                  <Chip size="small" variant="outlined" label={systemTemplates.length} />
                </Box>
                <Stack spacing={1}>{systemTemplates.map(renderRow)}</Stack>
              </Box>

              <Box component="section" aria-labelledby="customer-templates-heading">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 30, mb: 1 }}>
                  <Typography id="customer-templates-heading" variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
                    Customer Templates
                  </Typography>
                  <Chip size="small" variant="outlined" label={customerTemplates.length} />
                  {canAdminister && (
                    <Button size="small" startIcon={<AddRoundedIcon />} disabled={busy} onClick={() => setView({ kind: 'editor', template: null })}>
                      Create
                    </Button>
                  )}
                </Box>
                {customerTemplates.length > 0 ? (
                  <Stack spacing={1}>{customerTemplates.map(renderRow)}</Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ border: 1, borderColor: 'divider', borderStyle: 'dashed', borderRadius: '12px', p: 1.5 }}>
                    No customer templates yet. Create one, or clone a system template to start from it.
                  </Typography>
                )}
              </Box>
            </Box>
          </DialogContent>
        ) : (
          <WorkflowTemplateEditor
            key={editing?.id ?? 'new'}
            initialName={editing?.name ?? ''}
            initialDescription={editing?.description ?? ''}
            initialDefinition={structuredClone(editing?.versions[0]?.definition ?? emptyDefinition())}
            readOnly={!canAdminister || Boolean(editing?.isSystem)}
            saving={busy}
            error={failure}
            onCancel={backToList}
            onSave={(name, description, definition) =>
              void run(() => saveTemplate(editing?.id ?? null, name, description, definition), backToList)
            }
          />
        )}
      </Dialog>

      <Dialog open={Boolean(deleting)} onClose={() => !busy && setDeleting(null)} maxWidth="xs" fullWidth sx={{ zIndex: (t) => t.zIndex.modal + 12 }}>
        <DialogTitle>Delete workflow?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleting ? `Delete "${deleting.name}"? Workflows used by existing tickets cannot be deleted.` : ''}
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
