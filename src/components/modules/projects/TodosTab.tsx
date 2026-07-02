'use client'
/**
 * TODOS TAB — phases, tasks, optimistic updates. Task rows render via TodoItem.
 * Includes assignee/overdue filtering, phase rename + reorder (admin).
 */
import { useState, useTransition, useOptimistic } from 'react'
import { cn, isOverdue } from '@/lib/utils'
import {
  CheckCircle2, Plus, Trash2, ChevronDown, ChevronUp, Pencil, ListFilter,
} from 'lucide-react'
import {
  createTaskList,
  renameTaskList,
  moveTaskList,
  createTask,
  updateTask,
  updateTaskStatus,
  moveTask,
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
  templates:     ProjectTemplate[]
  isAdmin:       boolean
}

type OptimisticAction =
  | { type: 'toggle';       taskListId: string; taskId: string; status: TaskStatus }
  | { type: 'add-task';     taskListId: string; task: TaskWithMeta }
  | { type: 'edit-task';    taskListId: string; taskId: string; patch: TaskEditPatch }
  | { type: 'move-task';    taskListId: string; taskId: string; direction: -1 | 1 }
  | { type: 'delete-task';  taskListId: string; taskId: string }
  | { type: 'add-phase';    list: TaskListWithTasks }
  | { type: 'rename-phase'; taskListId: string; name: string }
  | { type: 'move-phase';   taskListId: string; direction: -1 | 1 }
  | { type: 'delete-phase'; taskListId: string }

function swapAdjacent<T>(arr: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || target < 0 || target >= arr.length) return arr
  const next = [...arr]
  const a = next[index]
  const b = next[target]
  if (a === undefined || b === undefined) return arr
  next[index]  = b
  next[target] = a
  return next
}

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
    case 'move-task':
      return state.map(list =>
        list.id !== action.taskListId ? list : {
          ...list,
          tasks: swapAdjacent(
            list.tasks,
            list.tasks.findIndex(t => t.id === action.taskId),
            action.direction,
          ),
        }
      )
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
    case 'move-phase':
      return swapAdjacent(
        state,
        state.findIndex(l => l.id === action.taskListId),
        action.direction,
      )
    case 'delete-phase':
      return state.filter(list => list.id !== action.taskListId)
  }
}

export function TodosTab({
  taskLists,
  projectId,
  currentUserId,
  members,
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

  // Filters — 'all' | 'unassigned' | userId, plus overdue-only
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterOverdue,  setFilterOverdue]  = useState(false)
  const filtersActive = filterAssignee !== 'all' || filterOverdue

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

  function handleMoveTask(taskListId: string, taskId: string, direction: -1 | 1) {
    startTransition(async () => {
      dispatch({ type: 'move-task', taskListId, taskId, direction })
      await withToast(
        () => moveTask(taskId, taskListId, projectId, direction),
        'Could not reorder the task.',
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

  function handleMovePhase(taskListId: string, direction: -1 | 1) {
    startTransition(async () => {
      dispatch({ type: 'move-phase', taskListId, direction })
      await withToast(
        () => moveTaskList(taskListId, projectId, direction),
        'Could not reorder the phase.',
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

      {optimisticLists.map((list, listIndex) => {
        const total    = list.tasks.length
        const done     = list.tasks.filter(t => t.status === 'done').length
        const progress = total > 0 ? Math.round((done / total) * 100) : 0
        const isTemp   = list.id.startsWith('temp-')
        const visibleTasks = list.tasks.filter(matchesFilters)
        const isRenaming   = renamingPhaseId === list.id

        // Hide phases with no matching tasks while filtering
        if (filtersActive && visibleTasks.length === 0) return null

        return (
          <div
            key={list.id}
            className={cn('card overflow-hidden transition-opacity', isTemp && 'opacity-60')}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-subtle">
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
                {isAdmin && !isTemp && !filtersActive && (
                  <div className="flex flex-col -my-1">
                    <button
                      onClick={() => handleMovePhase(list.id, -1)}
                      disabled={listIndex === 0}
                      className="p-0.5 rounded text-tertiary hover:text-primary disabled:opacity-25 transition-colors"
                      title="Move phase up"
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      onClick={() => handleMovePhase(list.id, 1)}
                      disabled={listIndex === optimisticLists.length - 1}
                      className="p-0.5 rounded text-tertiary hover:text-primary disabled:opacity-25 transition-colors"
                      title="Move phase down"
                    >
                      <ChevronDown className="size-3" />
                    </button>
                  </div>
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

            {visibleTasks.length > 0 && (
              <ul>
                {visibleTasks.map((task, taskIndex) => (
                  <TodoItem
                    key={task.id}
                    task={task}
                    listId={list.id}
                    projectId={projectId}
                    members={members}
                    isAdmin={isAdmin}
                    currentUserId={currentUserId}
                    onToggle={handleToggleStatus}
                    onEdit={handleEditTask}
                    onDelete={handleDeleteTask}
                    onMove={filtersActive ? undefined : handleMoveTask}
                    isFirst={taskIndex === 0}
                    isLast={taskIndex === visibleTasks.length - 1}
                  />
                ))}
              </ul>
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
          </div>
        )
      })}

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
