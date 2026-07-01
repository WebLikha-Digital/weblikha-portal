'use client'
import { useState, useTransition, useOptimistic } from 'react'
import { Avatar } from '@/components/ui'
import { formatDate, isOverdue, cn } from '@/lib/utils'
import {
  CheckCircle2, Circle, AlertCircle, Plus, Trash2, ChevronDown,
} from 'lucide-react'
import {
  createTaskList,
  createTask,
  updateTaskStatus,
  deleteTask,
  deleteTaskList,
  applyTemplate as applyTemplateAction,
} from '@/app/(portal)/projects/actions'
import type {
  TaskListWithTasks, ProjectMember, User, ProjectTemplate, Task, TaskStatus,
} from '@/types'

interface TodosTabProps {
  taskLists:  TaskListWithTasks[]
  projectId:  string
  members:    (ProjectMember & { user: User })[]
  templates:  ProjectTemplate[]
  isAdmin:    boolean
}

type OptimisticTask = Task & { assignee: User | null }

type OptimisticAction =
  | { type: 'toggle';       taskListId: string; taskId: string; status: TaskStatus }
  | { type: 'add-task';     taskListId: string; task: OptimisticTask }
  | { type: 'delete-task';  taskListId: string; taskId: string }
  | { type: 'add-phase';    list: TaskListWithTasks }
  | { type: 'delete-phase'; taskListId: string }

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
            t.id !== action.taskId ? t : { ...t, status: action.status }
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
    case 'delete-phase':
      return state.filter(list => list.id !== action.taskListId)
  }
}

export function TodosTab({
  taskLists,
  projectId,
  members,
  templates,
  isAdmin,
}: TodosTabProps) {
  const [isPending, startTransition] = useTransition()
  const [optimisticLists, dispatch]  = useOptimistic(taskLists, optimisticReducer)

  const [addingPhase, setAddingPhase] = useState(false)
  const [phaseName,   setPhaseName]   = useState('')

  const [addingTaskTo,   setAddingTaskTo]   = useState<string | null>(null)
  const [taskTitle,      setTaskTitle]      = useState('')
  const [taskDueDate,    setTaskDueDate]    = useState('')
  const [taskAssigneeId, setTaskAssigneeId] = useState('')

  const [showTemplates, setShowTemplates] = useState(false)

  function handleToggleStatus(taskListId: string, taskId: string, status: TaskStatus) {
    const next: TaskStatus = status === 'done' ? 'pending' : 'done'
    startTransition(async () => {
      dispatch({ type: 'toggle', taskListId, taskId, status: next })
      await updateTaskStatus(taskId, next, projectId)
    })
  }

  function handleAddTask(taskListId: string) {
    if (!taskTitle.trim() || !taskDueDate || isPending) return
    const assignee = members.find(m => m.user_id === taskAssigneeId)?.user ?? null
    const optimisticTask: OptimisticTask = {
      id:           `temp-${Date.now()}`,
      project_id:   projectId,
      task_list_id: taskListId,
      assignee_id:  taskAssigneeId || null,
      title:        taskTitle.trim(),
      description:  null,
      status:       'pending',
      due_date:     taskDueDate,
      completed_at: null,
      points_value: 60,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      assignee,
    }
    const fd = new FormData()
    fd.set('project_id',   projectId)
    fd.set('task_list_id', taskListId)
    fd.set('title',        taskTitle.trim())
    fd.set('due_date',     taskDueDate)
    if (taskAssigneeId) fd.set('assignee_id', taskAssigneeId)
    fd.set('points_value', '60')
    setTaskTitle('')
    setTaskDueDate('')
    setTaskAssigneeId('')
    setAddingTaskTo(null)
    startTransition(async () => {
      dispatch({ type: 'add-task', taskListId, task: optimisticTask })
      await createTask(fd)
    })
  }

  function handleDeleteTask(taskListId: string, taskId: string) {
    startTransition(async () => {
      dispatch({ type: 'delete-task', taskListId, taskId })
      await deleteTask(taskId, projectId)
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
      await createTaskList(projectId, name)
    })
  }

  function handleDeletePhase(taskListId: string) {
    if (!confirm('Delete this phase and all its tasks?')) return
    startTransition(async () => {
      dispatch({ type: 'delete-phase', taskListId })
      await deleteTaskList(taskListId, projectId)
    })
  }

  function handleApplyTemplate(templateId: string) {
    setShowTemplates(false)
    startTransition(async () => {
      await applyTemplateAction(projectId, templateId)
    })
  }

  function openAddTask(taskListId: string) {
    setAddingTaskTo(taskListId)
    setTaskTitle('')
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

  return (
    <div className="space-y-4">

      {isAdmin && (
        <div className="flex justify-end items-center gap-2">
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

      {optimisticLists.map(list => {
        const total    = list.tasks.length
        const done     = list.tasks.filter(t => t.status === 'done').length
        const progress = total > 0 ? Math.round((done / total) * 100) : 0
        const isTemp   = list.id.startsWith('temp-')

        return (
          <div
            key={list.id}
            className={cn('card overflow-hidden transition-opacity', isTemp && 'opacity-60')}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-primary">{list.name}</h3>
                <span className="text-2xs text-tertiary bg-bg-surface-3 px-2 py-0.5 rounded-full">
                  {total} task{total !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {total > 0 && (
                  <>
                    <div className="w-16 h-1.5 bg-bg-surface-3 rounded-full overflow-hidden">
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
                    className="ml-1 p-1 rounded text-tertiary hover:text-danger transition-colors"
                    title="Delete phase"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {list.tasks.length > 0 && (
              <ul>
                {list.tasks.map(task => {
                  const isDone    = task.status === 'done'
                  const overdue   = !isDone && Boolean(task.due_date) && isOverdue(task.due_date)
                  const isOptTemp = task.id.startsWith('temp-')

                  return (
                    <li
                      key={task.id}
                      className={cn(
                        'group flex items-center gap-3 px-4 py-2.5 border-b border-subtle last:border-b-0 hover:bg-bg-surface-2 transition-colors',
                        isOptTemp && 'opacity-60',
                      )}
                    >
                      <button
                        onClick={() => { if (!isOptTemp) handleToggleStatus(list.id, task.id, task.status) }}
                        disabled={isOptTemp}
                        className="shrink-0 text-tertiary hover:text-success transition-colors disabled:cursor-default"
                        title={isDone ? 'Mark incomplete' : 'Mark done'}
                      >
                        {isDone
                          ? <CheckCircle2 className="size-4 text-success" />
                          : overdue
                            ? <AlertCircle className="size-4 text-danger" />
                            : <Circle className="size-4" />
                        }
                      </button>

                      <span className={cn(
                        'flex-1 text-sm',
                        isDone ? 'line-through text-tertiary' : 'text-primary',
                      )}>
                        {task.title}
                      </span>

                      {task.assignee && (
                        <Avatar
                          name={task.assignee.name}
                          src={task.assignee.avatar_url}
                          size="xs"
                        />
                      )}

                      {task.due_date && (
                        <span className={cn(
                          'text-2xs',
                          overdue ? 'text-danger' : 'text-tertiary',
                        )}>
                          {formatDate(task.due_date)}
                        </span>
                      )}

                      {isAdmin && !isOptTemp && (
                        <button
                          onClick={() => handleDeleteTask(list.id, task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-tertiary hover:text-danger transition-all"
                          title="Delete task"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
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
