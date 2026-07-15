import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import { DETAIL_DIALOG_MAX_HEIGHT, DETAIL_DIALOG_WIDTH } from '../shared/layout'

/**
 * Reasons MUI's Dialog reports for an involuntary dismissal. Used by the
 * close-guard to distinguish backdrop/Esc from the explicit ✕/Cancel path.
 */
type DialogCloseReason = 'backdropClick' | 'escapeKeyDown' | 'closeButton'

export interface DetailDialogProps {
  /** Heading shown in the dialog header. */
  title: string
  /**
   * Explicit close path — invoked by the ✕ button, by a Cancel control in the
   * `footer`, and by an allowed backdrop/Esc dismissal. Deliberate closes should
   * always call this regardless of {@link canClose}.
   */
  onClose: () => void
  /**
   * Whether an involuntary dismissal (backdrop click / Esc key) is allowed. Pass
   * `false` while the form has unsaved edits to engage the close-guard; the ✕
   * button and any Cancel control still close via {@link onClose}.
   */
  canClose: boolean
  /** Scrollable left-column body — the detail fields. */
  children: ReactNode
  /** Pinned footer slot at the bottom of the left column (Save / Cancel / Delete). */
  footer: ReactNode
  /**
   * Optional independently-scrollable right column — the notes chat. Omit for a
   * single-column dialog (e.g. the Customer detail, which has no notes).
   */
  notes?: ReactNode
}

/**
 * Reusable centered-modal shell for entity detail editing (Task today; Project
 * and Customer next). Encapsulates: a centered MUI `Dialog` sized ~920px wide
 * and capped at ~85vh, going fullscreen on the `xs` breakpoint; a two-column
 * responsive layout whose right (notes) column is optional; a scrollable left
 * column with a pinned footer slot; an independently scrollable right column;
 * a title with a ✕ close; and the close-guard wiring — backdrop/Esc dismissals
 * are blocked unless `canClose`, while ✕/Cancel always close via `onClose`.
 *
 * Presentational and generic: all content arrives via props/children/slots so
 * each container wires its own fields, footer actions, and data seam.
 */
export function DetailDialog({
  title,
  onClose,
  canClose,
  children,
  footer,
  notes,
}: DetailDialogProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  function handleClose(_event: object, reason: DialogCloseReason) {
    // Close-guard: an involuntary dismissal is ignored while edits are unsaved;
    // the explicit ✕/Cancel path (reason 'closeButton') always closes.
    if ((reason === 'backdropClick' || reason === 'escapeKeyDown') && !canClose) {
      return
    }
    onClose()
  }

  return (
    <Dialog
      open
      onClose={handleClose}
      fullScreen={fullScreen}
      maxWidth={false}
      aria-labelledby="detail-dialog-title"
      slotProps={{
        paper: {
          sx: fullScreen
            ? { display: 'flex', flexDirection: 'column' }
            : {
                width: DETAIL_DIALOG_WIDTH,
                maxWidth: '100vw',
                height: DETAIL_DIALOG_MAX_HEIGHT,
                display: 'flex',
                flexDirection: 'column',
              },
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography id="detail-dialog-title" variant="h6" component="h2">
          {title}
        </Typography>
        <IconButton aria-label="Close" onClick={() => handleClose({}, 'closeButton')}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: notes ? { sm: 1 } : 0,
            borderBottom: notes ? { xs: 1, sm: 0 } : 0,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>{children}</Box>
          <Box
            sx={{
              flexShrink: 0,
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            {footer}
          </Box>
        </Box>
        {notes && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {notes}
          </Box>
        )}
      </Box>
    </Dialog>
  )
}
