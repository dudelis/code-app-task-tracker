import { useState } from 'react'
import './App.css'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { Csa_customersService } from './generated/services/Csa_customersService'
import { Csa_projectsService } from './generated/services/Csa_projectsService'
import { updateCustomerActive, type Customer } from './data/customers'
import { updateProjectActive, type Project } from './data/projects'
import { toggleActive } from './data/visibility'
import type { ResponsibleFilter } from './data/responsible'
import { runCustomerCascade, runProjectCascade } from './data/cascades'
import { useOverview } from './hooks/useOverview'
import type { CustomerPane, ProjectPane, TaskPane } from './types'
import { RAIL_WIDTH } from './shared/layout'
import { RESPONSIBLE_OPTIONS } from './shared/responsible'
import { RowMenu } from './components/RowMenu'
import { HardDeleteDialog } from './components/HardDeleteDialog'
import { Board } from './features/board/Board'
import { Grid } from './features/grid/Grid'
import { MyTasks } from './features/mytasks/MyTasks'
import { CustomerDetailPane } from './features/customer/CustomerDetailPane'
import { ProjectDetailPane } from './features/project/ProjectDetailPane'
import { TaskDetailPane } from './features/task/TaskDetailPane'
import { LabelsView } from './features/labels/LabelsView'

function App() {
  // The overview dataset and every optimistic mutation live in the hook; App
  // owns only view state (selection, panes, filters) and wiring to the layout.
  const {
    state,
    applyTaskStatus,
    applyTaskUpsert,
    applyTaskLabels,
    applyTaskRemove,
    applyCustomerUpsert,
    applyProjectUpsert,
    applyProjectRemove,
    applyCustomerRemove,
    applyLabelUpsert,
    applyLabelRemove,
  } = useOverview()

  // The rail selects a Customer whose swimlane board fills the main area; the
  // Labels management view is the one alternate screen still reachable.
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showLabels, setShowLabels] = useState(false)
  // The global My Tasks destination spans every customer and ignores the rail's
  // customer selection while active.
  const [showMyTasks, setShowMyTasks] = useState(false)
  // Per-customer workspace tab: the swimlane Board or the table Grid.
  const [customerView, setCustomerView] = useState<'board' | 'grid'>('board')
  const [responsibleFilter, setResponsibleFilter] = useState<ResponsibleFilter>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [customerPane, setCustomerPane] = useState<CustomerPane | null>(null)
  const [projectPane, setProjectPane] = useState<ProjectPane | null>(null)
  const [taskPane, setTaskPane] = useState<TaskPane | null>(null)
  // Delete targets drive the typed-name confirmation dialogs (ADR-0002); the
  // action error surfaces optimistic Activate/Deactivate failures in a Snackbar.
  const [customerDelete, setCustomerDelete] = useState<Customer | null>(null)
  const [projectDelete, setProjectDelete] = useState<Project | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function openCustomerPane(pane: CustomerPane) {
    setProjectPane(null)
    setTaskPane(null)
    setCustomerPane(pane)
  }

  function openProjectPane(pane: ProjectPane) {
    setCustomerPane(null)
    setTaskPane(null)
    setProjectPane(pane)
  }

  function openTaskPane(pane: TaskPane) {
    setCustomerPane(null)
    setProjectPane(null)
    setTaskPane(pane)
  }

  /**
   * One-click Activate/Deactivate for a Customer from its ⋯ menu: optimistically
   * flip the local record, then persist through the existing active-only write
   * seam. Revert and surface the error in the Snackbar if the write fails.
   */
  async function handleToggleCustomerActive(customer: Customer) {
    const next = toggleActive(customer.active)
    applyCustomerUpsert({ ...customer, active: next })
    try {
      await updateCustomerActive(
        (id, changedFields) => Csa_customersService.update(id, changedFields),
        customer.id,
        next,
      )
    } catch (e: unknown) {
      applyCustomerUpsert(customer)
      setActionError(e instanceof Error ? e.message : 'Could not update the customer.')
    }
  }

  /**
   * One-click Activate/Deactivate for a Project from its ⋯ menu: optimistically
   * flip the local record, then persist through the existing active-only write
   * seam. Revert and surface the error in the Snackbar if the write fails.
   */
  async function handleToggleProjectActive(project: Project) {
    const next = toggleActive(project.active)
    applyProjectUpsert({ ...project, active: next })
    try {
      await updateProjectActive(
        (id, changedFields) => Csa_projectsService.update(id, changedFields),
        project.id,
        next,
      )
    } catch (e: unknown) {
      applyProjectUpsert(project)
      setActionError(e instanceof Error ? e.message : 'Could not update the project.')
    }
  }

  const data = state.status === 'ready' ? state.data : null
  // The rail lists active Customers (Microsoft Planner's "plans"); Show inactive
  // widens it to include inactive Customers without changing the board itself.
  const railCustomers = data
    ? showInactive
      ? data.customers
      : data.customers.filter((customer) => customer.active)
    : []
  // Keep a valid selection: fall back to the first listed Customer when nothing
  // is selected yet or the selected one is filtered out (e.g. after Show inactive
  // is turned off), so the main area always has a board to show when possible.
  const effectiveCustomerId =
    selectedCustomerId && railCustomers.some((customer) => customer.id === selectedCustomerId)
      ? selectedCustomerId
      : (railCustomers[0]?.id ?? null)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Task Tracker
          </Typography>
          {state.status === 'ready' && (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={responsibleFilter}
                onChange={(_event, next: ResponsibleFilter | null) => {
                  if (next) setResponsibleFilter(next)
                }}
                aria-label="Responsible filter"
                className="responsible-filter"
                sx={{
                  '& .MuiToggleButton-root': {
                    color: 'inherit',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    px: 1.5,
                  },
                  '& .Mui-selected': {
                    bgcolor: 'rgba(255, 255, 255, 0.16)',
                  },
                }}
              >
                {RESPONSIBLE_OPTIONS.map((option) => (
                  <ToggleButton
                    key={option.value}
                    value={option.value}
                    aria-label={`Responsible: ${option.label}`}
                  >
                    {option.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <FormControlLabel
                className="show-inactive"
                control={
                  <Switch
                    color="default"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.target.checked)}
                  />
                }
                label="Show inactive"
              />
              <Button
                color="inherit"
                className="new-project"
                onClick={() =>
                  openProjectPane({ mode: 'create', customerId: effectiveCustomerId ?? '' })
                }
              >
                New Project
              </Button>
              <Button
                color="inherit"
                className="manage-labels"
                onClick={() => {
                  setTaskPane(null)
                  setCustomerPane(null)
                  setProjectPane(null)
                  setShowMyTasks(false)
                  setShowLabels(true)
                }}
              >
                Manage Labels
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: RAIL_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          {state.status === 'ready' && (
            <>
              <Box sx={{ p: 1 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  className="new-customer"
                  onClick={() => openCustomerPane({ mode: 'create' })}
                >
                  New Customer
                </Button>
              </Box>
              <List>
                <ListItem disablePadding>
                  <ListItemButton
                    className="my-tasks"
                    selected={showMyTasks}
                    onClick={() => {
                      setShowLabels(false)
                      setShowMyTasks(true)
                      setTaskPane(null)
                      setCustomerPane(null)
                      setProjectPane(null)
                    }}
                  >
                    <ListItemText primary="My Tasks" />
                  </ListItemButton>
                </ListItem>
              </List>
              {railCustomers.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  {showInactive ? 'No customers yet.' : 'No active customers yet.'}
                </Typography>
              ) : (
                <List>
                  {railCustomers.map((customer) => (
                    <ListItem
                      key={customer.id}
                      disablePadding
                      secondaryAction={
                        <RowMenu
                          label={customer.name}
                          active={customer.active}
                          onEdit={() => openCustomerPane({ mode: 'edit', customer })}
                          onToggleActive={() => void handleToggleCustomerActive(customer)}
                          onDelete={() => setCustomerDelete(customer)}
                        />
                      }
                    >
                      <ListItemButton
                        selected={!showLabels && !showMyTasks && customer.id === effectiveCustomerId}
                        onClick={() => {
                          setShowLabels(false)
                          setShowMyTasks(false)
                          setSelectedCustomerId(customer.id)
                          setTaskPane(null)
                        }}
                      >
                        <ListItemText
                          primary={customer.name}
                          secondary={!customer.active ? 'Inactive' : undefined}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </>
          )}
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: 3 }}>
        <Toolbar />
        {state.status === 'loading' && <Typography>Loading…</Typography>}
        {state.status === 'error' && (
          <Alert severity="error">Could not load data: {state.message}</Alert>
        )}
        {state.status === 'ready' && (
          <div className="board-layout">
            {showLabels ? (
              <LabelsView
                labels={state.data.labels}
                onBack={() => setShowLabels(false)}
                onLabelUpserted={applyLabelUpsert}
                onLabelRemoved={applyLabelRemove}
              />
            ) : showMyTasks ? (
              <MyTasks
                data={state.data}
                responsibleFilter={responsibleFilter}
                onTaskStatusChanged={applyTaskStatus}
                onSelectTask={(task) => openTaskPane({ mode: 'edit', task })}
                onTaskCreated={applyTaskUpsert}
              />
            ) : effectiveCustomerId ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Tabs
                  value={customerView}
                  onChange={(_event, next: 'board' | 'grid') => setCustomerView(next)}
                  aria-label="Customer view"
                  sx={{ mb: 1, minHeight: 40 }}
                >
                  <Tab label="Board" value="board" sx={{ minHeight: 40 }} />
                  <Tab label="Grid" value="grid" sx={{ minHeight: 40 }} />
                </Tabs>
                {customerView === 'board' ? (
                  <Board
                    data={state.data}
                    customerId={effectiveCustomerId}
                    responsibleFilter={responsibleFilter}
                    showInactive={showInactive}
                    onTaskStatusChanged={applyTaskStatus}
                    onSelectTask={(task) => openTaskPane({ mode: 'edit', task })}
                    onTaskCreated={applyTaskUpsert}
                    onEditProject={(project) => openProjectPane({ mode: 'edit', project })}
                    onToggleProjectActive={(project) => void handleToggleProjectActive(project)}
                    onDeleteProject={(project) => setProjectDelete(project)}
                  />
                ) : (
                  <Grid
                    data={state.data}
                    customerId={effectiveCustomerId}
                    responsibleFilter={responsibleFilter}
                    onTaskStatusChanged={applyTaskStatus}
                    onSelectTask={(task) => openTaskPane({ mode: 'edit', task })}
                    onTaskCreated={applyTaskUpsert}
                  />
                )}
              </Box>
            ) : (
              <Typography color="text.secondary">
                {railCustomers.length === 0
                  ? 'No customers to show. Use New Customer to add one.'
                  : 'Select a customer to see its board.'}
              </Typography>
            )}
            {customerPane && (
              <CustomerDetailPane
                key={customerPane.mode === 'edit' ? customerPane.customer.id : 'new-customer'}
                pane={customerPane}
                onClose={() => setCustomerPane(null)}
                onSaved={(customer) => {
                  applyCustomerUpsert(customer)
                  setCustomerPane({ mode: 'edit', customer })
                }}
              />
            )}
            {projectPane && (
              <ProjectDetailPane
                key={projectPane.mode === 'edit' ? projectPane.project.id : 'new-project'}
                pane={projectPane}
                customers={state.data.customers}
                onClose={() => setProjectPane(null)}
                onSaved={(project) => {
                  applyProjectUpsert(project)
                  setProjectPane({ mode: 'edit', project })
                }}
              />
            )}
            {taskPane && !showLabels && (
              <TaskDetailPane
                key={taskPane.task.id}
                pane={taskPane}
                projects={state.data.projects}
                customers={state.data.customers}
                allLabels={state.data.labels}
                attachedLabelIds={(state.data.taskLabels[taskPane.task.id] ?? []).map(
                  (l) => l.id,
                )}
                onClose={() => setTaskPane(null)}
                onSaved={(task) => {
                  applyTaskUpsert(task)
                  setTaskPane({ mode: 'edit', task })
                }}
                onLabelsSaved={applyTaskLabels}
                onLabelCreated={applyLabelUpsert}
                onDeleted={(taskId) => {
                  applyTaskRemove(taskId)
                  setTaskPane(null)
                }}
              />
            )}
          </div>
        )}
      </Box>
      {customerDelete && (
        <HardDeleteDialog
          entity="Customer"
          name={customerDelete.name}
          description="its projects, their tasks, those tasks' notes and label links, and the projects' notes and contact links"
          onCancel={() => setCustomerDelete(null)}
          onConfirm={async () => {
            await runCustomerCascade(customerDelete.id)
            applyCustomerRemove(customerDelete.id)
            setCustomerDelete(null)
          }}
        />
      )}
      {projectDelete && (
        <HardDeleteDialog
          entity="Project"
          name={projectDelete.name}
          description="its tasks, their notes and label links, its project notes, and its contact links"
          onCancel={() => setProjectDelete(null)}
          onConfirm={async () => {
            await runProjectCascade(projectDelete.id)
            applyProjectRemove(projectDelete.id)
            setProjectDelete(null)
          }}
        />
      )}
      <Snackbar
        open={Boolean(actionError)}
        autoHideDuration={6000}
        onClose={() => setActionError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ width: '100%' }}>
          {actionError}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default App
