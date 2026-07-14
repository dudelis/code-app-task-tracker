import { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import MoreVertIcon from '@mui/icons-material/MoreVert'

/**
 * The per-row "⋯" overflow menu shared by Customer rail rows and Project
 * swimlane headers: Edit, Activate/Deactivate (label follows `active`), and
 * Delete. Owns only its own anchor state; every action is a caller-supplied
 * callback so the menu carries no create/edit/delete logic itself. The trigger
 * stops click propagation so opening the menu never also selects the row.
 */
export function RowMenu({
  label,
  active,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  label: string
  active: boolean
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const close = () => setAnchorEl(null)
  return (
    <>
      <IconButton
        edge="end"
        size="small"
        aria-label={`Manage ${label}`}
        aria-haspopup="true"
        onClick={(event) => {
          event.stopPropagation()
          setAnchorEl(event.currentTarget)
        }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        <MenuItem
          onClick={() => {
            close()
            onEdit()
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            close()
            onToggleActive()
          }}
        >
          {active ? 'Deactivate' : 'Activate'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            close()
            onDelete()
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </>
  )
}
