'use client'
/**
 * TEMPLATE BUILDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Split-panel UI for managing task list templates:
 *   Left  — template list + create button
 *   Right — selected template: inline-editable name/description, phases, tasks
 *
 * All mutations use useOptimistic for instant feedback.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useTransition, useOptimistic, useRef, useEffect } from 'react'
import { Plus, Trash2, Pencil, X, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  createTemplate, updateTemplate, deleteTemplate,
  createTemplatePhase, updateTemplatePhase, deleteTemplatePhase,
  createTemplateTask, deleteTemplateTask,
} from '@/app/(portal)/settings/actions'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import type { ProjectTemplateWithLists, TemplateTaskList, TemplateTask } from '@/types'

// ── Optimistic reducer ─────────────────────────────────────────────────────────

type TemplateAction =
  | { type: 'add-template';    template: ProjectTemplateWithLists }
  | { type: 'delete-template'; id: string }
  | { type: 'update-template'; id: string; name: string; description: string | null }
  | { type: 'add-phase';       templateId: string; phase: TemplateTaskList & { tasks: TemplateTask[] } }
  | { type: 'delete-phase';    templateId: string; phaseId: string }
  | { type: 'update-phase';    templateId: string; phaseId: string; name: string }
  | { type: 'add-task';        templateId: string; phaseId: string; task: TemplateTask }
  | { type: 'delete-task';     templateId: string; phaseId: string; taskId: string }

function reducer(
  state: ProjectTemplateWithLists[],
  action: TemplateAction,
): ProjectTemplateWithLists[] {
  switch (action.type) {
    case 'add-template':
      return [...state, action.template]
    case 'delete-template':
      return state.filter(t => t.id !== action.id)
    case 'update-template':
      return state.map(t => t.id !== action.id ? t
        : { ...t, name: action.name, description: action.description })
    case 'add-phase':
      return state.map(t => t.id !== action.templateId ? t
        : { ...t, task_lists: [...t.task_lists, action.phase] })
    case 'delete-phase':
      return state.map(t => t.id !== action.templateId ? t
        : { ...t, task_lists: t.task_lists.filter(p => p.id !== action.phaseId) })
    case 'update-phase':
      return state.map(t => t.id !== action.templateId ? t : {
        ...t,
        task_lists: t.task_lists.map(p =>
          p.id !== action.phaseId ? p : { ...p, name: action.name }
        ),
      })
    case 'add-task':
      return state.map(t => t.id !== action.templateId ? t : {
        ...t,
        task_lists: t.task_lists.map(p =>
          p.id !== action.phaseId ? p : { ...p, tasks: [...p.tasks, action.task] }
        ),
      })
    case 'delete-task':
      return state.map(t => t.id !== action.templateId ? t : {
        ...t,
        task_lists: t.task_lists.map(p =>
          p.id !== action.phaseId ? p
            : { ...p, tasks: p.tasks.filter(tk => tk.id !== action.taskId) }
        ),
      })
  }
}

// ── Inline edit input ──────────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  onCancel,
  className,
  placeholder,
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
  className?: string
  placeholder?: string
}) {
  const [val, setVal] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && val.trim()) onSave(val.trim())
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => { if (val.trim() && val.trim() !== value) onSave(val.trim()); else onCancel() }}
      placeholder={placeholder}
      className={cn(
        'bg-bg-surface-3 border border-brand rounded px-2 py-0.5 text-primary focus:outline-none',
        className,
      )}
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TemplateBuilder({ templates }: { templates: ProjectTemplateWithLists[] }) {
  const [, startTransition] = useTransition()
  const [optimistic, dispatch]      = useOptimistic(templates, reducer)
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null)

  // Template list form
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [newTemplateName,  setNewTemplateName]  = useState('')

  // Inline editing: which field is open
  const [editingField, setEditingField] = useState<'name' | 'desc' | null>(null)

  // Phase editing
  const [addingPhase,    setAddingPhase]    = useState(false)
  const [newPhaseName,   setNewPhaseName]   = useState('')
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)

  // Task form per phase
  const [addingTaskTo, setAddingTaskTo] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const selected = optimistic.find(t => t.id === selectedId) ?? null

  // ── Template handlers ──────────────────────────────────────────────────────

  function handleCreateTemplate() {
    if (!newTemplateName.trim()) return
    const name = newTemplateName.trim()
    const tempId = `temp-${Date.now()}`
    const optimisticTemplate: ProjectTemplateWithLists = {
      id: tempId, name, description: null, created_by: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      task_lists: [],
    }
    setNewTemplateName('')
    setCreatingTemplate(false)
    startTransition(async () => {
      dispatch({ type: 'add-template', template: optimisticTemplate })
      const created = await createTemplate(name)
      // After server responds, select the real template
      setSelectedId(created.id)
    })
    setSelectedId(tempId)
  }

  async function handleDeleteTemplate(id: string) {
    const ok = await confirmDialog({
      title:   'Delete this template?',
      message: 'All of its phases and tasks will be deleted. Existing projects are not affected.',
    })
    if (!ok) return
    if (selectedId === id) {
      const remaining = optimistic.filter(t => t.id !== id)
      setSelectedId(remaining[0]?.id ?? null)
    }
    startTransition(async () => {
      dispatch({ type: 'delete-template', id })
      await deleteTemplate(id)
    })
  }

  function handleRenameTemplate(id: string, name: string) {
    const desc = selected?.description ?? null
    setEditingField(null)
    startTransition(async () => {
      dispatch({ type: 'update-template', id, name, description: desc })
      await updateTemplate(id, name, desc)
    })
  }

  function handleUpdateDesc(id: string, description: string) {
    const name = selected?.name ?? ''
    setEditingField(null)
    startTransition(async () => {
      dispatch({ type: 'update-template', id, name, description: description || null })
      await updateTemplate(id, name, description || null)
    })
  }

  // ── Phase handlers ─────────────────────────────────────────────────────────

  function handleAddPhase() {
    if (!newPhaseName.trim() || !selectedId) return
    const name     = newPhaseName.trim()
    const position = (selected?.task_lists.length ?? 0)
    const tempPhase: TemplateTaskList & { tasks: TemplateTask[] } = {
      id: `temp-${Date.now()}`, template_id: selectedId,
      name, position, created_at: new Date().toISOString(), tasks: [],
    }
    setNewPhaseName('')
    setAddingPhase(false)
    startTransition(async () => {
      dispatch({ type: 'add-phase', templateId: selectedId, phase: tempPhase })
      await createTemplatePhase(selectedId, name, position)
    })
  }

  async function handleDeletePhase(phaseId: string) {
    if (!selectedId) return
    const ok = await confirmDialog({
      title:   'Delete this phase?',
      message: 'Its template tasks will be deleted too.',
    })
    if (!ok) return
    startTransition(async () => {
      dispatch({ type: 'delete-phase', templateId: selectedId, phaseId })
      await deleteTemplatePhase(phaseId)
    })
  }

  function handleRenamePhase(phaseId: string, name: string) {
    if (!selectedId) return
    setEditingPhaseId(null)
    startTransition(async () => {
      dispatch({ type: 'update-phase', templateId: selectedId, phaseId, name })
      await updateTemplatePhase(phaseId, name)
    })
  }

  // ── Task handlers ──────────────────────────────────────────────────────────

  function handleAddTask(phaseId: string) {
    if (!newTaskTitle.trim() || !selectedId) return
    const title    = newTaskTitle.trim()
    const phase    = selected?.task_lists.find(p => p.id === phaseId)
    const position = phase?.tasks.length ?? 0
    const tempTask: TemplateTask = {
      id: `temp-${Date.now()}`, template_task_list_id: phaseId,
      title, description: null, points_value: 60, position,
      created_at: new Date().toISOString(),
    }
    setNewTaskTitle('')
    setAddingTaskTo(null)
    startTransition(async () => {
      dispatch({ type: 'add-task', templateId: selectedId, phaseId, task: tempTask })
      await createTemplateTask(phaseId, title, 60, position)
    })
  }

  async function handleDeleteTask(phaseId: string, taskId: string) {
    if (!selectedId) return
    const ok = await confirmDialog({ title: 'Delete this template task?' })
    if (!ok) return
    startTransition(async () => {
      dispatch({ type: 'delete-task', templateId: selectedId, phaseId, taskId })
      await deleteTemplateTask(taskId)
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // Stacks vertically on mobile; split panel from md up
    <div className="flex flex-col md:flex-row gap-4 md:min-h-[480px]">

      {/* ── Left: template list ── */}
      <div className="w-full md:w-52 shrink-0 flex flex-col gap-1">
        {optimistic.map(t => {
          const isTemp   = t.id.startsWith('temp-')
          const isActive = t.id === selectedId
          return (
            <button
              key={t.id}
              onClick={() => { if (!isTemp) setSelectedId(t.id) }}
              className={cn(
                'group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                isActive
                  ? 'bg-warning-bg text-brand font-medium'
                  : 'text-secondary hover:bg-bg-overlay hover:text-primary',
                isTemp && 'opacity-60 cursor-default',
              )}
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="flex-1 truncate">{t.name}</span>
              {!isTemp && isActive && (
                <span
                  role="button"
                  onClick={e => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-danger transition-all"
                  title="Delete template"
                >
                  <Trash2 className="size-3" />
                </span>
              )}
            </button>
          )
        })}

        {/* New template form */}
        {creatingTemplate ? (
          <div className="flex flex-col gap-1 mt-1">
            <input
              autoFocus
              type="text"
              placeholder="Template name"
              value={newTemplateName}
              onChange={e => setNewTemplateName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateTemplate()
                if (e.key === 'Escape') { setCreatingTemplate(false); setNewTemplateName('') }
              }}
              className="w-full h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary placeholder:text-tertiary focus:outline-none focus:border-brand"
            />
            <div className="flex gap-1">
              <button
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim()}
                className="flex-1 h-7 text-xs bg-brand text-bg-base rounded-md font-medium hover:bg-brand/90 disabled:opacity-40 transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => { setCreatingTemplate(false); setNewTemplateName('') }}
                className="h-7 px-2 text-xs text-secondary hover:text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreatingTemplate(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-tertiary hover:text-secondary transition-colors mt-1"
          >
            <Plus className="size-3.5" /> New template
          </button>
        )}
      </div>

      {/* ── Right: template detail ── */}
      <div className="flex-1">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <FileText className="size-8 text-tertiary mb-3" />
            <p className="text-sm text-secondary">Select a template to edit, or create a new one.</p>
          </div>
        ) : (
          <div className="card p-5">

            {/* Template header */}
            <div className="flex items-start justify-between gap-4 mb-5 pb-5 border-b border-subtle">
              <div className="flex-1 min-w-0 space-y-1">
                {/* Name */}
                {editingField === 'name' ? (
                  <InlineEdit
                    value={selected.name}
                    onSave={v => handleRenameTemplate(selected.id, v)}
                    onCancel={() => setEditingField(null)}
                    className="text-base font-semibold w-full"
                  />
                ) : (
                  <button
                    onClick={() => setEditingField('name')}
                    className="group flex items-center gap-1.5 text-base font-semibold text-primary hover:text-brand transition-colors"
                  >
                    {selected.name}
                    <Pencil className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </button>
                )}
                {/* Description */}
                {editingField === 'desc' ? (
                  <InlineEdit
                    value={selected.description ?? ''}
                    onSave={v => handleUpdateDesc(selected.id, v)}
                    onCancel={() => setEditingField(null)}
                    className="text-sm w-full"
                    placeholder="Add a description..."
                  />
                ) : (
                  <button
                    onClick={() => setEditingField('desc')}
                    className="group flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors text-left"
                  >
                    {selected.description ?? (
                      <span className="text-tertiary italic">Add a description...</span>
                    )}
                    <Pencil className="size-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                  </button>
                )}
              </div>
              <span className="text-2xs text-tertiary bg-bg-surface-3 px-2 py-1 rounded-full whitespace-nowrap shrink-0">
                {selected.task_lists.length} phase{selected.task_lists.length !== 1 ? 's' : ''} ·{' '}
                {selected.task_lists.reduce((n, p) => n + p.tasks.length, 0)} tasks
              </span>
            </div>

            {/* Phases */}
            <div className="space-y-3">
              {selected.task_lists.map(phase => {
                const isTemp = phase.id.startsWith('temp-')
                return (
                  <div
                    key={phase.id}
                    className={cn('border border-subtle rounded-lg overflow-hidden', isTemp && 'opacity-60')}
                  >
                    {/* Phase header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-bg-surface-2">
                      {editingPhaseId === phase.id ? (
                        <InlineEdit
                          value={phase.name}
                          onSave={v => handleRenamePhase(phase.id, v)}
                          onCancel={() => setEditingPhaseId(null)}
                          className="text-sm flex-1"
                        />
                      ) : (
                        <button
                          onClick={() => { if (!isTemp) setEditingPhaseId(phase.id) }}
                          className="group flex items-center gap-1.5 flex-1 text-sm font-medium text-primary hover:text-brand transition-colors text-left"
                        >
                          {phase.name}
                          <Pencil className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                      )}
                      <span className="text-2xs text-tertiary">{phase.tasks.length} tasks</span>
                      {!isTemp && (
                        <button
                          onClick={() => handleDeletePhase(phase.id)}
                          className="p-1 text-tertiary hover:text-danger transition-colors rounded"
                          title="Delete phase"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Tasks */}
                    {phase.tasks.length > 0 && (
                      <ul>
                        {phase.tasks.map(task => {
                          const isTaskTemp = task.id.startsWith('temp-')
                          return (
                            <li
                              key={task.id}
                              className={cn(
                                'group flex items-center gap-3 px-4 py-2 border-t border-subtle hover:bg-bg-surface-2 transition-colors',
                                isTaskTemp && 'opacity-60',
                              )}
                            >
                              <span className="flex-1 text-sm text-primary">{task.title}</span>
                              <span className="text-2xs text-tertiary bg-bg-surface-3 px-1.5 py-0.5 rounded-full">
                                {task.points_value} pts
                              </span>
                              {!isTaskTemp && (
                                <button
                                  onClick={() => handleDeleteTask(phase.id, task.id)}
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

                    {/* Add task */}
                    {addingTaskTo === phase.id ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-subtle bg-bg-surface-2">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Task title"
                          value={newTaskTitle}
                          onChange={e => setNewTaskTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddTask(phase.id)
                            if (e.key === 'Escape') { setAddingTaskTo(null); setNewTaskTitle('') }
                          }}
                          className="flex-1 h-7 px-2 text-sm bg-bg-surface-3 border border-subtle rounded text-primary placeholder:text-tertiary focus:outline-none focus:border-brand"
                        />
                        <button
                          onClick={() => handleAddTask(phase.id)}
                          disabled={!newTaskTitle.trim()}
                          className="h-7 px-2.5 text-xs bg-brand text-bg-base rounded font-medium disabled:opacity-40 hover:bg-brand/90 transition-colors"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setAddingTaskTo(null); setNewTaskTitle('') }}
                          className="p-1 text-secondary hover:text-primary transition-colors"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingTaskTo(phase.id); setNewTaskTitle('') }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-tertiary hover:text-secondary border-t border-subtle transition-colors"
                      >
                        <Plus className="size-3.5" /> Add task
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Add phase */}
              {addingPhase ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Phase name"
                    value={newPhaseName}
                    onChange={e => setNewPhaseName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddPhase()
                      if (e.key === 'Escape') { setAddingPhase(false); setNewPhaseName('') }
                    }}
                    className="flex-1 h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary placeholder:text-tertiary focus:outline-none focus:border-brand"
                  />
                  <button
                    onClick={handleAddPhase}
                    disabled={!newPhaseName.trim()}
                    className="h-8 px-3 text-sm bg-brand text-bg-base rounded-md font-medium disabled:opacity-40 hover:bg-brand/90 transition-colors"
                  >
                    Add phase
                  </button>
                  <button
                    onClick={() => { setAddingPhase(false); setNewPhaseName('') }}
                    className="h-8 px-2 text-sm text-secondary hover:text-primary transition-colors"
                  >
               