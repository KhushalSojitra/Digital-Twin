import { useState } from 'react'
import {
  Badge,
  FormControlLabel,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Radio,
  RadioGroup,
  Tooltip,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material'
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined'
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded'
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded'
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import PreviewOutlinedIcon from '@mui/icons-material/PreviewOutlined'
import HideImageOutlinedIcon from '@mui/icons-material/HideImageOutlined'
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined'
import TicketFilters from './TicketFilters'
import ImprovementSummary from './ImprovementSummary'
import { TICKET_SIZE_LABEL, activeFilterCount, type TicketFilterState, type TicketPinSize } from './ticketFilters'
import type { Ticket } from '../../data/tickets'

interface Props {
  tickets: Ticket[]
  filters: TicketFilterState
  onFiltersChange: (next: TicketFilterState) => void
  hideFilters?: Array<keyof TicketFilterState>
  onManage: () => void
  scopeLabel: string
  ticketViewEnabled?: boolean
  onToggleTicketView?: () => void
  ticketPreviewEnabled?: boolean
  onToggleTicketPreview?: () => void
  ticketSize?: TicketPinSize
  onTicketSizeChange?: (size: TicketPinSize) => void
  buttonSx?: SxProps<Theme>
}

export default function TicketMenu({
  tickets,
  filters,
  onFiltersChange,
  hideFilters,
  onManage,
  scopeLabel,
  ticketViewEnabled = true,
  onToggleTicketView,
  ticketPreviewEnabled,
  onToggleTicketPreview,
  ticketSize = 'medium',
  onTicketSizeChange,
  buttonSx,
}: Props) {
  const [buttonEl, setButtonEl] = useState<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [kind, setKind] = useState<'filter' | 'trends' | 'size' | null>(null)
  const count = activeFilterCount(filters)

  return (
    <>
      <Tooltip title="Ticket Management">
        <IconButton
          ref={setButtonEl}
          size="small"
          aria-label="Ticket Management"
          onClick={(e) => setAnchor(e.currentTarget)}
          color={count > 0 ? 'primary' : 'default'}
          sx={buttonSx}
        >
          <Badge badgeContent={count} color="primary" slotProps={{ badge: { sx: { fontSize: 9, height: 15, minWidth: 15 } } }}>
            <ConfirmationNumberOutlinedIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { borderRadius: '12px', minWidth: 200 } } }}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null)
            onManage()
          }}
        >
          <ListItemIcon>
            <ViewListRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Manage Tickets</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setKind('trends')
            setAnchor(null)
          }}
        >
          <ListItemIcon>
            <ShowChartRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Trends</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setKind('filter')
            setAnchor(null)
          }}
        >
          <ListItemIcon>
            <FilterListRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Filter</ListItemText>
        </MenuItem>
        {onToggleTicketView && (
          <MenuItem
            onClick={() => {
              setAnchor(null)
              onToggleTicketView()
            }}
          >
            <ListItemIcon>
              {ticketViewEnabled ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{ticketViewEnabled ? 'Disable ticket view' : 'Enable ticket view'}</ListItemText>
          </MenuItem>
        )}
        {onToggleTicketPreview && (
          <MenuItem
            onClick={() => {
              setAnchor(null)
              onToggleTicketPreview()
            }}
          >
            <ListItemIcon>
              {ticketPreviewEnabled ? <HideImageOutlinedIcon fontSize="small" /> : <PreviewOutlinedIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{ticketPreviewEnabled ? 'Disable ticket preview' : 'Enable ticket preview'}</ListItemText>
          </MenuItem>
        )}
        {onTicketSizeChange && (
          <MenuItem
            onClick={() => {
              setKind('size')
              setAnchor(null)
            }}
          >
            <ListItemIcon>
              <StraightenOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Ticket size · {TICKET_SIZE_LABEL[ticketSize]}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Popover
        open={Boolean(kind)}
        anchorEl={buttonEl}
        onClose={() => setKind(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              p: kind === 'trends' ? 0 : 1.25,
              width: { xs: 'min(360px, calc(100vw - 20px))', sm: kind === 'size' ? 240 : 360 },
              maxHeight: 'min(70dvh, 640px)',
              overflow: 'auto',
              borderRadius: '14px',
            },
          },
        }}
      >
        {kind === 'filter' && <TicketFilters value={filters} onChange={onFiltersChange} hide={hideFilters} />}
        {kind === 'trends' && <ImprovementSummary tickets={tickets} scopeLabel={scopeLabel} dense />}
        {kind === 'size' && onTicketSizeChange && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              Ticket size
            </Typography>
            <RadioGroup value={ticketSize} onChange={(_, next) => onTicketSizeChange(next as TicketPinSize)}>
              {(Object.keys(TICKET_SIZE_LABEL) as TicketPinSize[]).map((size) => (
                <FormControlLabel key={size} value={size} control={<Radio size="small" />} label={TICKET_SIZE_LABEL[size]} />
              ))}
            </RadioGroup>
          </>
        )}
      </Popover>
    </>
  )
}
