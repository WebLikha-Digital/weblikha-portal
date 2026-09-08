'use client'
/**
 * TODO ITEM
 * ─────────────────────────────────────────────────────────────────────────────
 * Single task row inside a TodosTab phase card.
 * Handles: status toggle, inline edit (admin + assignee), completed date,
 * drag-and-drop reordering (admin), self-claim for providers, and an
 * expandable comment thread.
 *
 * Comment add/delete is optimistic locally; task field edits are dispatched
 * up to TodosTab's optimistic reducer via onEdit.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useTransition, useOptimistic } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar } from '@/components/ui'
import { formatDate, formatDateShort, formatRelative, isOverdue, cn } from '@/lib/utils'
import {
  CheckCircle2, Circle, CircleDot, AlertCircle, MessageSquare, Pencil, Trash2,
  GripVertical, UserPlus, Loader2,
} from 'lucide-react'
import {
  createTaskComment, updateTaskComment, deleteTaskComment,
} from '@/app/(portal)/projects/actions'
import { CommentEditor } from '@/components/modules/projects/CommentEditor'
import { CommentBody } from '@/components/modules/projects/CommentBody'
import { withToast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import type {
  TaskWithMeta, TaskStatus, TaskCommentWithAuthor, ProjectMember, User, UserRole,
} from '@/types'

export interface TaskEditPatch {
  title:        string
  description:  string | null
  due_date:     string
  assignee_id:  string | null
  assignee:     User | null
  points_value?: number
}

/** Click cycle: pending → in progress → done → pending */
const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  pending:     'in_progress',
  in_progress: 'done',
  done:        'pending',
}

const STATUS_HINT: Record<TaskStatus, string> = {
  pending:     'Mark in progress',
  in_progress: 'Mark done',
  done:        'Mark incomplete',
}

interface TodoItemProps {
  task:          TaskWithMeta
  listId:        string
  projectId:    string
  members:       (ProjectMember & { user: User })[]
  /** Full viewer role — capabilities below are derived from this, not a single admin flag. */
  viewerRole:    UserRole
  currentUserId: string
  onToggle:      (listId: string, taskId: string, next: TaskStatus) => void
  onEdit:        (listId: string, taskId: string, patch: TaskEditPatch) => void
  onDelete:      (listId: string, taskId: string) => void
  onClaim:       (listId: string, taskId: string) => void
  /** False while filters are active — reordering a filtered view is ambiguous */
  canReorder:    boolean
}

type CommentAction =
  | { type: 'add';    comment: TaskCommentWithAuthor }
  | { type: 'edit';   commentId: string; body: string; mentions: string[] }
  | { type: 'delete'; commentId: string }

function commentsReducer(
  state: TaskCommentWithAuthor[],
  action: CommentAction,
): TaskCommentWithAuthor[] {
  switch (action.type) {
    case 'add':    return [...state, action.comment]
    case 'edit':
      return state.map(c => c.id !== action.commentId ? c : {
        ...c,
        body:       action.body,
        mentions:   action.mentions,
        updated_at: new Date().toISOString(),
      })
    case 'delete': return state.filter(c => c.id !== action.commentId)
  }
}

/** Small shared "still saving" hint for optimistic items */
function SavingIndicator({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-1 text-2xs text-tertiary whitespace-nowrap', className)}>
      <Loader2 className="size-3 animate-spin" aria-hidden />
      Saving…
    </span>
  )
}

export function TodoItem({
  task,
  listId,
  projectId,
  members,
  viewerRole,
  currentUserId,
  onToggle,
  onEdit,
  onDelete,
  onClaim,
  canReorder,
}: TodoItemProps) {
  const [, startTransition] = useTransition()
  const [optimisticComments, dispatchComment] =
    useOptimistic(task.comments ?? [], commentsReducer)

  const [editing,          setEditing]          = useState(false)
  const [showComments,     setShowComments]     = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)

  const [editTitle,       setEditTitle]       = useState(task.title)
  const [editDescription, setEditDescription] = useState(task.description ?? '')
  const [editDueDate,     setEditDueDate]     = useState(task.due_date)
  const [editAssigneeId,  setEditAssigneeId]  = useState(task.assignee_id ?? '')
  const [editPoints,      setEditPoints]      = useState(String(task.points_value))

  // Gates that are genuinely admin-only keep reading this exactly as before.
  const isAdmin  = viewerRole === 'admin'
  const isClient = viewerRole === 'client'

  const isDone     = task.status === 'done'
  const inProgress = task.status === 'in_progress'
  const overdue    = !isDone && Boolean(task.due_date) && isOverdue(task.due_date)
  const isOptTemp = task.id.startsWith('temp-')

  // Ownership: a null creator (pre-migration-014 task) is never "owned" by
  // the current client — do not let null coerce to a match. Matches RLS
  // ("tasks: client edits own pending" / "client deletes own pending").
  const isOwnPendingTask = task.created_by !== null && task.created_by === currentUserId &&
                           task.status === 'pending'

  // Providers keep the existing assignee-based edit rule untouched; clients
  // get an ownership-based rule instead (RLS grants clients nothing via the
  // assignee policy — migration 015 explicitly excludes the client role
  // from "tasks: assignee updates status").
  const canEditTask   = !isOptTemp && (
    isAdmin || (isClient ? isOwnPendingTask : task.assignee_id === currentUserId)
  )
  const canDeleteTask = !isOptTemp && (isAdmin || (isClient && isOwnPendingTask))

  // Self-claim on unassigned tasks is provider-only (migration 014 narrowed
  // "tasks: member claims unassigned" to "tasks: provider claims unassigned"
  // specifically so a client project member could not claim team work).
  const canClaim  = !isOptTemp && viewerRole === 'provider' && !task.assignee_id &&
                    members.some(m => m.user_id === currentUserId)

  // Clients can never mark a task done — RLS excludes the client role from
  // the only status-changing policy, so this keeps the UI from offering an
  // action the server will reject.
  const canToggleStatus = !isClient

  const currentUser = members.find(m => m.user_id === currentUserId)?.user ?? null

  // Providers can only assign to themselves; admins and clients (on tasks
  // they're entitled to edit) can assign to anyone already on the project.
  const assignableMembers = (isAdmin || isClient)
    ? members
    : members.filter(m => m.user_id === currentUserId)

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id:       task.id,
    data:     { type: 'task', listId },
    disabled: !canReorder || isOptTemp,
  })

  function openEdit() {
    setEditTitle(task.title)
    setEditDescription(task.description ?? '')
    setEditDueDate(task.due_date)
    setEditAssigneeId(task.assignee_id ?? '')
    setEditPoints(String(task.points_value))
    setEditing(true)
  }

  function handleSaveEdit() {
    const title = editTitle.trim()
    if (!title || !editDueDate) return
    const assignee = members.find(m => m.user_id === editAssigneeId)?.user ?? null
    const patch: TaskEditPatch = {
      title,
      description: editDescription.trim() || null,
      due_date:    editDueDate,
      assignee_id: editAssigneeId || null,
      assignee,
    }
    if (isAdmin) {
      const points = parseInt(editPoints, 10)
      if (!Number.isNaN(points) && points >= 0) patch.points_value = points
    }
    setEditing(false)
    onEdit(listId, task.id, patch)
  }

  function handleAddComment(html: string, mentions: string[]) {
    const now = new Date().toISOString()
    const optimistic: TaskCommentWithAuthor = {
      id:         `temp-${Date.now()}`,
      task_id:    task.id,
      author_id:  currentUserId,
      body:       html,
      mentions,
      created_at: now,
      updated_at: now,
      author:     currentUser,
    }
    startTransition(async () => {
      dispatchComment({ type: 'add', comment: optimistic })
      await withToast(
        () => createTaskComment(task.id, projectId, html, mentions),
        'Could not post the comment.',
      )
    })
  }

  function handleEditComment(commentId: string, html: string, mentions: string[]) {
    setEditingCommentId(null)
    startTransition(async () => {
      dispatchComment({ type: 'edit', commentId, body: html, mentions })
      await withToast(
        () => updateTaskComment(commentId, projectId, html, mentions),
        'Could not save the comment.',
      )
    })
  }

  async function handleDeleteComment(commentId: string) {
    const ok = await confirmDialog({
      title:   'Delete this comment?',
      message: 'The comment and any attached images will be removed.',
    })
    if (!ok) return
    startTransition(async () => {
      dispatchComment({ type: 'delete', commentId })
      await withToast(
        () => deleteTaskComment(commentId, projectId),
        'Could not delete the comment.',
      )
    })
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group border-b border-subtle last:border-b-0 transition-colors',
        isOptTemp && 'opacity-60',
        isDragging && 'opacity-30', // source stays dimmed in place; DragOverlay is the moving copy
      )}
    >
      {/* Main row */}
      {/* select-none on mobile: long-press means "drag", not "select text" */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-bg-surface-2 transition-colors select-none sm:select-auto">
        {canReorder && !isOptTemp && (
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 -ml-1.5 p-0.5 rounded text-tertiary hover:text-secondary touch-none cursor-grab active:cursor-grabbing transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            <GripVertical className="size-3.5" />
          </button>
        )}

        <button
          onClick={() => {
            if (!isOptTemp && canToggleStatus) onToggle(listId, task.id, NEXT_STATUS[task.status])
          }}
          disabled={isOptTemp || !canToggleStatus}
          className="shrink-0 text-tertiary hover:text-success transition-colors disabled:cursor-default disabled:hover:text-tertiary"
          title={canToggleStatus ? STATUS_HINT[task.status] : undefined}
          aria-label={canToggleStatus ? STATUS_HINT[task.status] : "Only the team can change a to-do's status"}
        >
          {isDone
            ? <CheckCircle2 className="size-4 text-success" />
            : inProgress
              ? <CircleDot className={cn('size-4', overdue ? 'text-danger' : 'text-warning')} />
              : overdue
                ? <AlertCircle className="size-4 text-danger" />
                : <Circle className="size-4" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <span className={cn(
            'block truncate text-sm',
            isDone ? 'line-through text-tertiary' : 'text-primary',
          )}>
            {task.title}
          </span>
          {task.description && (
            <p className="truncate text-2xs text-tertiary" title={task.description}>
              {task.description}
            </p>
          )}
        </div>

        {/* Actions — inline on desktop; on mobile they wrap onto their own
            row below the title so the title stays fully readable */}
        <div className="flex items-center gap-2 sm:gap-3 basis-full sm:basis-auto pl-7 sm:pl-0">

        {/* Still saving (optimistic create) */}
        {isOptTemp && <SavingIndicator />}

        {/* Provider self-assign on unassigned tasks */}
        {canClaim && (
          <button
            onClick={() => onClaim(listId, task.id)}
            className="flex items-center gap-1 h-6 px-2 rounded-full border border-subtle text-2xs text-secondary hover:text-brand hover:border-brand active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            title="Assign this to-do to yourself"
          >
            <UserPlus className="size-3" />
            <span className="hidden sm:inline">Assign me</span>
          </button>
        )}

        {/* Comment thread toggle — always visible when there are comments */}
        {!isOptTemp && (
          <button
            onClick={() => setShowComments(v => !v)}
            className={cn(
              'flex items-center gap-1 p-1 rounded text-2xs transition-all',
              showComments
                ? 'text-brand'
                : optimisticComments.length > 0
                  ? 'text-secondary hover:text-primary'
                  : 'text-tertiary hover:text-secondary opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
            )}
            title={showComments ? 'Hide comments' : 'Show comments'}
          >
            <MessageSquare className="size-3.5" />
            {optimisticComments.length > 0 && optimisticComments.length}
          </button>
        )}

        {task.assignee && (
          <Avatar
            name={task.assignee.name}
            src={task.assignee.avatar_url}
            size="xs"
          />
        )}

        {/* Date: finished date when done, due date otherwise */}
        {isDone && task.completed_at ? (
          <span
            className="text-2xs text-success whitespace-nowrap"
            title={`Finished ${formatDate(task.completed_at)}`}
          >
            ✓ {formatDateShort(task.completed_at)}
          </span>
        ) : task.due_date && (
          <span className={cn(
            'text-2xs',
            overdue ? 'text-danger' : 'text-tertiary',
          )}>
            {formatDate(task.due_date)}
          </span>
        )}

        {/* Edit + delete — pushed to the right edge on mobile */}
        <div className="flex items-center gap-1 ml-auto sm:ml-0">
          {canEditTask && (
            <button
              onClick={() => (editing ? setEditing(false) : openEdit())}
              className="p-1 rounded text-tertiary hover:text-primary transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              title="Edit to-do"
            >
              <Pencil className="size-3.5" />
            </button>
          )}

          {canDeleteTask && (
            <button
              onClick={() => onDelete(listId, task.id)}
              className="p-1 rounded text-tertiary hover:text-danger transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              title="Delete task"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="px-4 py-3 space-y-2 bg-bg-surface-2 border-t border-subtle">
          <input
            autoFocus
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  handleSaveEdit()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="w-full h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary placeholder:text-tertiary focus:outline-none focus:border-brand"
          />
          <textarea
            placeholder="Description (optional)"
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary placeholder:text-tertiary focus:outline-none focus:border-brand resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={editDueDate}
              onChange={e => setEditDueDate(e.target.value)}
              className="h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary focus:outline-none focus:border-brand"
            />
            {assignableMembers.length > 0 && (
              <select
                value={editAssigneeId}
                onChange={e => setEditAssigneeId(e.target.value)}
                className="h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary focus:outline-none focus:border-brand flex-1 min-w-[140px]"
              >
                <option value="">No assignee</option>
                {assignableMembers.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === currentUserId && !isAdmin ? 'Me' : m.user.name}
                  </option>
                ))}
              </select>
            )}
            {isAdmin && (
              <input
                type="number"
                min={0}
                value={editPoints}
                onChange={e => setEditPoints(e.target.value)}
                title="Points value"
                className="w-20 h-8 px-3 text-sm bg-bg-surface-3 border border-subtle rounded-md text-primary focus:outline-none focus:border-brand"
              />
            )}
            <button
              onClick={handleSaveEdit}
              disabled={!editTitle.trim() || !editDueDate}
              className="h-8 px-3 text-sm bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 disabled:opacity-40 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-8 px-2 text-sm text-secondary hover:text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Comment thread */}
      {showComments && (
        <div className="px-4 py-3 space-y-3 bg-bg-surface-2 border-t border-subtle">
          {optimisticComments.length === 0 && (
            <p className="text-xs text-tertiary">No comments yet. Start the discussion.</p>
          )}

          {optimisticComments.map(comment => {
            const isTemp     = comment.id.startsWith('temp-')
            const isAuthor   = comment.author_id === currentUserId
            const canDelete  = !isTemp && (isAdmin || isAuthor)
            const wasEdited  = comment.updated_at !== comment.created_at
            const isEditing  = editingCommentId === comment.id

            return (
              <div
                key={comment.id}
                className={cn('group/comment flex items-start gap-2.5', isTemp && 'opacity-60')}
              >
                <Avatar
                  name={comment.author?.name ?? 'Unknown'}
                  src={comment.author?.avatar_url ?? null}
                  size="xs"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-primary">
                      {comment.author?.name ?? 'Unknown'}
                    </span>
                    <span className="text-2xs text-tertiary">
                      {formatRelative(comment.created_at)}
                      {wasEdited && ' · edited'}
                    </span>
                    {isTemp && <SavingIndicator />}
                    {isAuthor && !isTemp && !isEditing && (
                      <button
                        onClick={() => setEditingCommentId(comment.id)}
                        className="p-0.5 rounded text-tertiary hover:text-primary transition-all opacity-100 sm:opacity-0 sm:group-hover/comment:opacity-100"
                        title="Edit comment"
                      >
                        <Pencil className="size-3" />
                      </button>
                    )}
                    {canDelete && !isEditing && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="p-0.5 rounded text-tertiary hover:text-danger transition-all opacity-100 sm:opacity-0 sm:group-hover/comment:opacity-100"
                        title="Delete comment"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-1">
                      <CommentEditor
                        taskId={task.id}
                        members={members}
                        initialContent={comment.body}
                        submitLabel="Save"
                        autoFocus
                        onSubmit={(html, mentions) => handleEditComment(comment.id, html, mentions)}
                        onCancel={() => setEditingCommentId(null)}
                      />
                    </div>
                  ) : (
                    <CommentBody body={comment.body} />
                  )}
                </div>
              </div>
            )
          })}

          {/* Add comment */}
          <CommentEditor
            taskId={task.id}
            members={members}
            onSubmit={handleAddComment}
          />
        </div>
      )}
    </li>
  )
}
