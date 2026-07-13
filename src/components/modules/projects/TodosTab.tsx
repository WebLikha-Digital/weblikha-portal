'use client'
/**
 * TODOS TAB — phases, tasks, optimistic updates. Task rows render via TodoItem.
 * Includes assignee/overdue filtering, phase rename + collapse, and
 * drag-and-drop reordering (admin): tasks within/between phases, phases
 * within the project. Mobile: long-press to drag.
 */
import { useState, useEffect, useTransition, useOptimistic } from 'react'
import {
  DndContext, DragOverlay, closestCorners, MouseSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, type DraggableAttributes,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn, isOverdue } from '@/lib/utils'
import {
  CheckCircle2, Plus, Trash2, ChevronDown, Pencil, ListFilter, GripVertical, Loader2,
} from 'lucide-react'
import {
  createTaskList,
  renameTaskList,
  reorderTaskList,
  createTask,
  updateTask,
  updateTaskStatus,
  reorderTask,
  claimTask,
  deleteTask,
  deleteTaskList,
  applyTemplate as applyTemplateAction,
} from '@/app/(portal)/projects/actions'
import { TodoItem, type TaskEditPatch } from '@/components/modules/projects/TodoItem'
import { withToast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import type {
  TaskListWithTasks, TaskWithMeta, ProjectMember, User, ProjectTemplate, TaskStatus,
} from '@/types'

interface TodosTabProps {
  taskLists:     TaskListWithTasks[]
  projectId:     string
  currentUserId: string
  members:       (ProjectMember & { user: User })[]
  admins:        User[]
  templates:     ProjectTemplate[]
  isAdmin:       boolean
}

type OptimisticAction =
  | { type: 'toggle';        taskListId: string; taskId: string; status: TaskStatus }
  | { type: 'add-task';      taskListId: string; task: TaskWithMeta }
  | { type: 'edit-task';     taskListId: string; taskId: string; patch: TaskEditPatch }
  | { type: 'claim-task';    taskListId: string; taskId: string; assignee: User }
  | { type: 'reorder-task';  taskId: string; fromListId: string; toListId: string; toIndex: number }
  | { type: 'delete-task';   taskListId: string; taskId: string }
  | { type: 'add-phase';     list: TaskListWithTasks }
  | { type: 'rename-phase';  taskListId: string; name: string }
  | { type: 'reorder-phase'; taskListId: string; toIndex: number }
  | { type: 'delete-phase';  taskListId: string }

function optimisticReducer(
  state: TaskListWithTasks[],
  action: OptimisticAction,
): TaskListWithTasks[] {
  switch (action.type) {
    case 'toggle':
      return state.map(list =>
        list.id !== action.taskListId ? list : {
          ...list,
          tasks: list.tasks.map(t =>
            t.id !== action.taskId ? t : {
              ...t,
              status: action.status,
              // Mirror the DB trigger: stamp/clear completed_at on toggle
              completed_at: action.status === 'done' ? new Date().toISOString() : null,
            }
          ),
        }
      )
    case 'edit-task':
      return state.map(list =>
        list.id !== action.taskListId ? list : {
          ...list,
          tasks: list.tasks.map(t =>
            t.id !== action.taskId ? t : { ...t, ...action.patch }
          ),
        }
      )
    case 'claim-task':
      return state.map(list =>
        list.id !== action.taskListId ? list : {
          ...list,
          tasks: list.tasks.map(t =>
            t.id !== action.taskId ? t : {
              ...t,
              assignee_id: action.assignee.id,
              assignee:    action.assignee,
            }
          ),
        }
      )
    case 'reorder-task': {
      const fromList = state.find(l => l.id === action.fromListId)
      const moved    = fromList?.tasks.find(t => t.id === action.taskId)
      if (!moved) return state

      if (action.fromListId === action.toListId) {
        return state.map(list => {
          if (list.id !== action.fromListId) return list
          const fromIndex = list.tasks.findIndex(t => t.id === action.taskId)
          if (fromIndex === -1) return list
          return { ...list, tasks: arrayMove(list.tasks, fromIndex, action.toIndex) }
        })
      }

      return state.map(list => {
        if (list.id === action.fromListId) {
          return { ...list, tasks: list.tasks.filter(t => t.id !== action.taskId) }
        }
        if (list.id === action.toListId) {
          const next = [...list.tasks]
          next.splice(action.toIndex, 0, { ...moved, task_list_id: action.toListId })
          return { ...list, tasks: next }
        }
        return list
      })
    }
    case 'add-task':
      return state.map(list =>
        list.id !== action.taskListId ? list : {
          ...list,
          tasks: [...list.tasks, action.task],
        }
      )
    case 'delete-task':
      return state.map(list =>
        list.id !== action.taskListId ? list : {
          ...list,
          tasks: list.tasks.filter(t => t.id !== action.taskId),
        }
      )
    case 'add-phase':
      return [...state, action.list]
    case 'rename-phase':
      return state.map(list =>
        list.id !== action.taskListId ? list : { ...list, name: action.name }
      )
    case 'reorder-phase': {
      const fromIndex = state.findIndex(l => l.id === action.taskListId)
      if (fromIndex === -1) return state
      return arrayMove(state, fromIndex, action.toIndex)
    }
    case 'delete-phase':
      return state.filter(list => list.id !== action.taskListId)
  }
}

/** Sortable wrapper for a phase card; exposes drag-handle props to the header. */
type PhaseHandle = {
  attributes: DraggableAttributes
  listeners:  ReturnType<typeof useSortable>['listeners']
}

function SortablePhase({
  id,
  disabled,
  className,
  children,
}: {
  id:        string
  disabled:  boolean
  className: string
  children:  (handle: PhaseHandle) => React.ReactNode
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id, data: { type: 'phase' }, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(className, isDragging && 'opacity-40')}
    >
      {children({ attributes, listeners })}
    </div>
  )
}

export function TodosTab({
  taskLists,
  projectId,
  currentUserId,
  members,
  admins,
  templates,
  isAdmin,
}: TodosTabProps) {
  const [isPending, startTransition] = useTransition()
  const [optimisticLists, dispatch]  = useOptimistic(taskLists, optimisticReducer)

  const [addingPhase, setAddingPhase] = useState(false)
  const [phaseName,   setPhaseName]   = useState('')

  const [renamingPhaseId, setRenamingPhaseId] = useState<string | null>(null)
  const [renameValue,     setRenameValue]     = useState('')

  const [addingTaskTo,    setAddingTaskTo]    = useState<string | null>(null)
  const [taskTitle,       setTaskTitle]       = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskDueDate,     setTaskDueDate]     = useState('')
  const [taskAssigneeId,  setTaskAssigneeId]  = useState('')

  const [showTemplates, setShowTemplates] = useState(false)

  // Collapsed phases — persisted per project so the layout survives reloads
  const collapseKey = `todos-collapsed:${projectId}`
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapseKey)
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]))
    } catch { /* corrupt or unavailable storage — start expanded */ }
  }, [collapseKey])

  function toggleCollapsed(listId: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(listId)) {
        next.delete(listId)
      } else {
        next.add(listId)
      }
      try { localStorage.setItem(collapseKey, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  // Filters — 'all' | 'unassigned' | userId, plus overdue-only
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterOverdue,  setFilterOverdue]  = useState(false)
  const filtersActive = filterAssignee !== 'all' || filterOverdue

  const isMember = members.some(m => m.user_id === currentUserId)

  // Any project member can drag tasks; phase structure stays admin-only
  const canReorderTasks  = (isAdmin || isMember) && !filtersActive
  const canReorderPhases = isAdmin && !filtersActive

  // Desktop: drag after 6px so clicks still work. Mobile: long-press so the
  // page scrolls normally.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  // Floating copy rendered while dragging — phase cards are overflow-hidden,
  // so the row itself gets clipped the moment it leaves its own card.
  const [activeDrag, setActiveDrag] = useState<
    | { kind: 'task';  task: TaskWithMeta }
    | { kind: 'phase'; list: TaskListWithTasks }
    | null
  >(null)

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type?: string; listId?: string } | undefined
    if (data?.type === 'task') {
      const list = optimisticLists.find(l => l.id === data.listId)
      const task = list?.tasks.find(t => t.id === String(event.active.id))
      if (task) setActiveDrag({ kind: 'task', task })
    } else if (data?.type === 'phase') {
      const list = optimisticLists.find(l => l.id === String(event.active.id))
      if (list) setActiveDrag({ kind: 'phase', list })
    }
  }

  function matchesFilters(t: TaskWithMeta): boolean {
    if (filterAssignee === 'unassigned' && t.assignee_id !== null) return false
    if (filterAssignee !== 'all' && filterAssignee !== 'unassigned' && t.assignee_id !== filterAssignee) return false
    if (filterOverdue && (t.status === 'done' || !isOverdue(t.due_date))) return false
    return true
  }

  function handleToggleStatus(taskListId: string, taskId: string, next: TaskStatus) {
    startTransition(async () => {
      dispatch({ type: 'toggle', taskListId, taskId, status: next })
      await withToast(
        () => updateTaskStatus(taskId, next, projectId),
        'Could not update the task status.',
      )
    })
  }

  function handleAddTask(taskListId: string) {
    if (!taskTitle.trim() || !taskDueDate || isPending) return
    const assignee = members.find(m => m.user_id === taskAssigneeId)?.user ?? null
    const listLength = optimisticLists.find(l => l.id === taskListId)?.tasks.length ?? 0
    const optimisticTask: TaskWithMeta = {
      id:           `temp-${Date.now()}`,
      project_id:   projectId,
      task_list_id: taskListId,
      assignee_id:  taskAssigneeId || null,
      title:        taskTitle.trim(),
      description:  taskDescription.trim() || null,
      status:       'pending',
      due_date:     taskDueDate,
      completed_at: null,
      points_value: 60,
      position:     listLength,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      assignee,
      comments:     [],
    }
    const fd = new FormData()
    fd.set('project_id',   projectId)
    fd.set('task_list_id', taskListId)
    fd.set('title',        taskTitle.trim())
    if (taskDescription.trim()) fd.set('description', taskDescription.trim())
    fd.set('due_date',     taskDueDate)
    if (taskAssigneeId) fd.set('assignee_id', taskAssigneeId)
    fd.set('points_value', '60')
    setTaskTitle('')
    setTaskDescription('')
    setTaskDueDate('')
    setTaskAssigneeId('')
    setAddingTaskTo(null)
    startTransition(async () => {
      dispatch({ type: 'add-task', taskListId, task: optimisticTask })
      await withToast(() => createTask(fd), 'Could not add the task.')
    })
  }

  function handleEditTask(taskListId: string, taskId: string, patch: TaskEditPatch) {
    startTransition(async () => {
      dispatch({ type: 'edit-task', taskListId, taskId, patch })
      await withToast(
        () => updateTask(taskId, projectId, {
          title:        patch.title,
          description:  patch.description,
          due_date:     patch.due_date,
          assignee_id:  patch.assignee_id,
          ...(patch.points_value !== undefined && { points_value: patch.points_value }),
        }),
        'Could not save the task.',
      )
    })
  }

  function handleClaimTask(taskListId: string, taskId: string) {
    const me = members.find(m => m.user_id === currentUserId)?.user
    if (!me) return
    startTransition(async () => {
      dispatch({ type: 'claim-task', taskListId, taskId, assignee: me })
      await withToast(
        () => claimTask(taskId, projectId),
        'Could not assign this task to you.',
      )
    })
  }

  async function handleDeleteTask(taskListId: string, taskId: string) {
    const ok = await confirmDialog({
      title:   'Delete this to-do?',
      message: 'Its comments and attachments will be deleted too.',
    })
    if (!ok) return
    startTransition(async () => {
      dispatch({ type: 'delete-task', taskListId, taskId })
      await withToast(() => deleteTask(taskId, projectId), 'Could not delete the task.')
    })
  }

  function handleAddPhase() {
    if (!phaseName.trim() || isPending) return
    const optimisticList: TaskListWithTasks = {
      id:         `temp-${Date.now()}`,
      project_id: projectId,
      name:       phaseName.trim(),
      position:   optimisticLists.length,
      created_at: new Date().toISOString(),
      tasks:      [],
    }
    const name = phaseName.trim()
    setPhaseName('')
    setAddingPhase(false)
    startTransition(async () => {
      dispatch({ type: 'add-phase', list: optimisticList })
      await withToast(() => createTaskList(projectId, name), 'Could not add the phase.')
    })
  }

  function handleRenamePhase(taskListId: string) {
    const name = renameValue.trim()
    setRenamingPhaseId(null)
    if (!name) return
    startTransition(async () => {
      dispatch({ type: 'rename-phase', taskListId, name })
      await withToast(
        () => renameTaskList(taskListId, projectId, name),
        'Could not rename the phase.',
      )
    })
  }

  async function handleDeletePhase(taskListId: string) {
    const ok = await confirmDialog({
      title:   'Delete this phase?',
      message: 'All of its tasks, comments, and attachments will be deleted.',
    })
    if (!ok) return
    startTransition(async () => {
      dispatch({ type: 'delete-phase', taskListId })
      await withToast(() => deleteTaskList(taskListId, projectId), 'Could not delete the phase.')
    })
  }

  function handleApplyTemplate(templateId: string) {
    setShowTemplates(false)
    startTransition(async () => {
      await withToast(
        () => applyTemplateAction(projectId, templateId),
        'Could not apply the template.',
      )
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current as { type?: string; listId?: string } | undefined
    const overData   = over.data.current   as { type?: string; listId?: string } | undefined

    // ── Phase reorder ──
    if (activeData?.type === 'phase') {
      const overPhaseId = overData?.type === 'phase' ? String(over.id) : overData?.listId
      if (!overPhaseId || overPhaseId === String(active.id)) return
      const toIndex = optimisticLists.findIndex(l => l.id === overPhaseId)
      if (toIndex === -1) return
      const phaseId = String(active.id)
      startTransition(async () => {
        dispatch({ type: 'reorder-phase', taskListId: phaseId, toIndex })
        await withToast(
          () => reorderTaskList(phaseId, projectId, toIndex),
          'Could not reorder the phase.',
        )
      })
      return
    }

    // ── Task reorder / move between phases ──
    const taskId     = String(active.id)
    const fromListId = activeData?.listId
    if (!fromListId) return

    let toListId: string
    let toIndex:  number

    if (overData?.type === 'task') {
      if (String(over.id) === taskId) return
      toListId = overData.listId ?? fromListId
      const targetList = optimisticLists.find(l => l.id === toListId)
      if (!targetList) return
      toIndex = targetList.tasks.findIndex(t => t.id === String(over.id))
      if (toIndex === -1) return
    } else if (overData?.type === 'phase') {
      toListId = String(over.id)
      const targetList = optimisticLists.find(l => l.id === toListId)
      if (!targetList) return
      // Dropping on the phase card itself appends to the end
      toIndex = toListId === fromListId
        ? Math.max(0, targetList.tasks.length - 1)
        : targetList.tasks.length
    } else {
      return
    }

    if (toListId === fromListId) {
      const fromList  = optimisticLists.find(l => l.id === fromListId)
      const fromIndex = fromList?.tasks.findIndex(t => t.id === taskId) ?? -1
      if (fromIndex === -1 || fromIndex === toIndex) return
    }

    startTransition(async () => {
      dispatch({ type: 'reorder-task', taskId, fromListId, toListId, toIndex })
      await withToast(
        () => reorderTask(taskId, projectId, toListId, toIndex),
        'Could not move the task.',
      )
    })
  }

  function openAddTask(taskListId: string) {
    setAddingTaskTo(taskListId)
    setTaskTitle('')
    setTaskDescription('')
    setTaskDueDate('')
    setTaskAssigneeId('')
  }

  const TemplateDropdown = (
    <div className="relative">
      <button
        onClick={() => setShowTemplates(v => !v)}
        disabled={isPending}
        className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-subtle text-sm text-secondary hover:text-primary hover:border-[var(--color-border-default)] transition-colors disabled:opacity-40"
      >
        {isPending ? 'Applying...' : 'Apply template'} <ChevronDown className="size-3.5" />
      </button>
      {showTemplates && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
          <div className="absolute top-full mt-1 right-0 z-20 min-w-[200px] bg-bg-surface-2 border border-subtle rounded-lg shadow-lg overflow-hidden">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => handleApplyTemplate(t.id)}
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-bg-surface-3 transition-colors"
              >
                {t.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  if (optimisticLists.length === 0 && !addingPhase) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="size-8 text-tertiary mb-3" />
        <p className="text-primary font-medium">No phases yet</p>
        <p className="text-sm text-secondary mt-1">Add a phase to start tracking work.</p>
        {isAdmin && (
          <div className="mt-4 flex items-center gap-2">
            {templates.length > 0 && TemplateDropdown}
            <button
              onClick={() => setAddingPhase(true)}
              className="flex items-center gap-2 h-8 px-3 rounded-md border border-subtle text-sm text-secondary hover:text-primary hover:border-[var(--color-border-default)] transition-colors"
            >
              <Plus className="size-3.5" /> New phase
            </button>
          </div>
        )}
      </div>
    )
  }

  const hasTasks = optimisticLists.some(l => l.tasks.length > 0)

  return (
    <div className="space-y-4">

      {/* Filter bar + admin actions */}
      <div className="flex flex-wrap items-center gap-2">
        {hasTasks && (
          <>
            <ListFilter className="size-3.5 text-tertiary" aria-hidden />
            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="h-8 px-2 text-sm bg-bg-surface-2 border border-subtle rounded-md text-primary focus:outline-none focus:border-brand"
              aria-label="Filter by assignee"
            >
              <option value="all">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.user.name}</option>
              ))}
            </select>
            <button
              onClick={() => setFilterOverdue(v => !v)}
              className={cn(
                'h-8 px-3 text-sm rounded-md border transition-colors',
                filterOverdue
                  ? 'border-danger text-danger bg-danger/10'
                  : 'border-subtle text-secondary hover:text-primary',
              )}
            >
              Overdue
            </button>
            {filtersActive && (
              <span className="text-2xs text-tertiary">Reordering disabled while filtering</span>
            )}
          </>
        )}

        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            {templates.length > 0 && TemplateDropdown}
            <button
              onClick={() => setAddingPhase(true)}
              disabled={isPending}
              className="flex items-center gap-2 h-8 px-3 rounded-md border border-subtle text-sm text-secondary hover:text-primary hover:border-[var(--color-border-default)] transition-colors disabled:opacity-40"
            >
              <Plus className="size-3.5" /> New phase
            </button>
          </div>
        )}
      </div>

      <DndContext
        id="todos-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDrag(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={optimisticLists.map(l => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {optimisticLists.map(list => {
            const total    = list.tasks.length
            const done     = list.tasks.filter(t => t.status === 'done').length
            const progress = total > 0 ? Math.round((done / total) * 100) : 0
            const isTemp   = list.id.startsWith('temp-')
            const visibleTasks = list.tasks.filter(matchesFilters)
            const isRenaming   = renamingPhaseId === list.id
            // While filtering, collapse state is ignored so matches stay visible
            const isCollapsed  = collapsed.has(list.id) && !filtersActive

            // Hide phases with no matching tasks while filtering
            if (filtersActive && visibleTasks.length === 0) return null

            return (
              <SortablePhase
                key={list.id}
                id={list.id}
                disabled={!canReorderPhases || isTemp}
                className={cn('card overflow-hidden transition-opacity', isTemp && 'opacity-60')}
              >
                {({ attributes, listeners }) => (
                  <>
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-subtle select-none sm:select-auto">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {canReorderPhases && !isTemp && (
                          <button
                            {...attributes}
                            {...listeners}
                            className="shrink-0 -ml-2 p-0.5 rounded text-tertiary hover:text-secondary touch-none cursor-grab active:cursor-grabbing transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                            title="Drag to reorder phase"
                            aria-label="Drag to reorder phase"
                          >
                            <GripVertical className="size-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => toggleCollapsed(list.id)}
                          disabled={filtersActive}
                          className="shrink-0 p-0.5 rounded text-tertiary hover:text-primary transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                          title={isCollapsed ? 'Expand phase' : 'Collapse phase'}
                          aria-expanded={!isCollapsed}
                        >
                          <ChevronDown className={cn(
                            'size-3.5 transition-transform duration-150',
                            isCollapsed && '-rotate-90',
                          )} />
                        </button>

                        {isRenaming ? (
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  handleRenamePhase(list.id)
                              if (e.key === 'Escape') setRenamingPhaseId(null)
                            }}
                            onBlur={() => handleRenamePhase(list.id)}
                            className="flex-1 min-w-0 h-7 px-2 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary focus:outline-none focus:border-brand"
                          />
                        ) : (
                          <div className="group/phase flex items-center gap-2 min-w-0">
                            <h3 className="text-sm font-medium text-primary truncate">{list.name}</h3>
                            <span className="shrink-0 text-2xs text-tertiary bg-bg-surface-3 px-2 py-0.5 rounded-full">
                              {total} task{total !== 1 ? 's' : ''}
                            </span>
                            {isTemp && (
                              <span className="flex items-center gap-1 text-2xs text-tertiary whitespace-nowrap">
                                <Loader2 className="size-3 animate-spin" aria-hidden />
                                Saving…
                              </span>
                            )}
                            {isAdmin && !isTemp && (
                              <button
                                onClick={() => { setRenamingPhaseId(list.id); setRenameValue(list.name) }}
                                className="p-1 rounded text-tertiary hover:text-primary transition-all opacity-100 sm:opacity-0 sm:group-hover/phase:opacity-100"
                                title="Rename phase"
                              >
                                <Pencil className="size-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {total > 0 && (
                          <>
                            <div className="hidden sm:block w-16 h-1.5 bg-bg-surface-3 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-success rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-2xs text-secondary">{done}/{total}</span>
                          </>
                        )}
                        {isAdmin && !isTemp && (
                          <button
                            onClick={() => handleDeletePhase(list.id)}
                            className="p-1 rounded text-tertiary hover:text-danger transition-colors"
                            title="Delete phase"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <>
                        {visibleTasks.length > 0 && (
                          <SortableContext
                            items={visibleTasks.map(t => t.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <ul>
                              {visibleTasks.map(task => (
                                <TodoItem
                                  key={task.id}
                                  task={task}
                                  listId={list.id}
                                  projectId={projectId}
                                  members={members}
                                  admins={admins}
                                  isAdmin={isAdmin}
                                  currentUserId={currentUserId}
                                  onToggle={handleToggleStatus}
                                  onEdit={handleEditTask}
                                  onDelete={handleDeleteTask}
                                  onClaim={handleClaimTask}
                                  canReorder={canReorderTasks}
                                />
                              ))}
                            </ul>
                          </SortableContext>
                        )}

                        {addingTaskTo === list.id ? (
                          <div className="px-4 py-3 border-t border-subtle space-y-2 bg-bg-surface-2">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Task title"
                              value={taskTitle}
                              onChange={e => setTaskTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleAddTask(list.id)
                                if (e.key === 'Escape') setAddingTaskTo(null)
                              }}
                              className="w-full h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary placeholder:text-tertiary focus:outline-none focus:border-brand"
                            />
                            <textarea
                              placeholder="Description (optional)"
                              value={taskDescription}
                              onChange={e => setTaskDescription(e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary placeholder:text-tertiary focus:outline-none focus:border-brand resize-y"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="date"
                                value={taskDueDate}
                                onChange={e => setTaskDueDate(e.target.value)}
                                className="h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary focus:outline-none focus:border-brand"
                              />
                              {members.length > 0 && (
                                <select
                                  value={taskAssigneeId}
                                  onChange={e => setTaskAssigneeId(e.target.value)}
                                  className="h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary focus:outline-none focus:border-brand flex-1 min-w-[140px]"
                                >
                                  <option value="">No assignee</option>
                                  {members.map(m => (
                                    <option key={m.user_id} value={m.user_id}>
                                      {m.user.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                onClick={() => handleAddTask(list.id)}
                                disabled={!taskTitle.trim() || !taskDueDate}
                                className="h-8 px-3 text-sm bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 disabled:opacity-40 transition-colors"
                              >
                                Add
                              </button>
                              <button
                                onClick={() => setAddingTaskTo(null)}
                                className="h-8 px-2 text-sm text-secondary hover:text-primary transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openAddTask(list.id)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-tertiary hover:text-secondary transition-colors border-t border-subtle"
                          >
                            <Plus className="size-3.5" /> Add to-do
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </SortablePhase>
            )
          })}
        </SortableContext>

        <DragOverlay>
          {activeDrag?.kind === 'task' && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-brand/40 bg-bg-surface-2 shadow-xl cursor-grabbing">
              <GripVertical className="size-3.5 text-tertiary shrink-0" />
              <span className={cn(
                'truncate text-sm',
                activeDrag.task.status === 'done' ? 'line-through text-tertiary' : 'text-primary',
              )}>
                {activeDrag.task.title}
              </span>
              {activeDrag.task.assignee && (
                <span className="ml-auto text-2xs text-tertiary shrink-0">
                  {activeDrag.task.assignee.name}
                </span>
              )}
            </div>
          )}
          {activeDrag?.kind === 'phase' && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-brand/40 bg-bg-surface-2 shadow-xl cursor-grabbing">
              <GripVertical className="size-3.5 text-tertiary shrink-0" />
              <span className="text-sm font-medium text-primary truncate">{activeDrag.list.name}</span>
              <span className="text-2xs text-tertiary shrink-0">
                {activeDrag.list.tasks.length} task{activeDrag.list.tasks.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {addingPhase && (
        <div className="card p-4 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            type="text"
            placeholder="Phase name (e.g. Design Phase)"
            value={phaseName}
            onChange={e => setPhaseName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddPhase()
              if (e.key === 'Escape') { setAddingPhase(false); setPhaseName('') }
            }}
            className="flex-1 min-w-[200px] h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary placeholder:text-tertiary focus:outline-none focus:border-brand"
          />
          <button
            onClick={handleAddPhase}
            disabled={!phaseName.trim()}
            className="h-8 px-3 text-sm bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 disabled:opacity-40 transition-colors"
          >
            Add phase
          </button>
          <button
            onClick={() => { setAddingPhase(false); setPhaseName('') }}
            className="h-8 px-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {isAdmin && !addingPhase && optimisticLists.length > 0 && (
        <button
          onClick={() => setAddingPhase(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-tertiary hover:text-secondary border border-dashed border-subtle rounded-lg transition-colors"
        >
          <Plus className="size-3.5" /> Add another phase
        </button>
      )}
    </div>
  )
}
