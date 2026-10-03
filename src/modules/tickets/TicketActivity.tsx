import { Avatar, Box, Step, StepContent, StepLabel, Stepper, Typography } from '@mui/material'
import { LIFECYCLE_COLOR, LIFECYCLE_LABEL, type Ticket } from '../../data/tickets'
import { formatDateTime, initials } from '../../utils/format'

/** Lifecycle progression as a stepper, with the remaining activity listed underneath. */
export default function TicketActivity({ ticket }: { ticket: Ticket }) {
  const timeline = ticket.timeline ?? []
  const states = timeline.filter((e) => e.state)
  const updates = timeline.filter((e) => !e.state)

  return (
    <Box>
      <Stepper orientation="vertical" activeStep={states.length - 1} sx={{ '& .MuiStepConnector-line': { minHeight: 10 } }}>
        {states.map((ev, i) => {
          const color = LIFECYCLE_COLOR[ev.state!]
          return (
            <Step key={`${ev.at}-${i}`} completed={i < states.length - 1} expanded>
              <StepLabel
                slots={{
                  stepIcon: () => (
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        bgcolor: color,
                        border: '2px solid',
                        borderColor: 'background.paper',
                        boxShadow: `0 0 0 2px ${color}44`,
                      }}
                    />
                  ),
                }}
              >
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color }}>{LIFECYCLE_LABEL[ev.state!]}</Typography>
              </StepLabel>
              <StepContent sx={{ pb: 1.25 }}>
                <Typography sx={{ fontSize: 12.5 }}>{ev.text}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {ev.by} · {formatDateTime(ev.at)}
                </Typography>
              </StepContent>
            </Step>
          )
        })}
      </Stepper>

      {updates.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 0.75, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}
          >
            Updates
          </Typography>
          {updates.map((ev, i) => (
            <Box key={`${ev.at}-${i}`} sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Avatar sx={{ width: 22, height: 22, fontSize: 9, fontWeight: 700, bgcolor: 'secondary.main' }}>{initials(ev.by)}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5 }}>{ev.text}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {ev.by} · {formatDateTime(ev.at)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
