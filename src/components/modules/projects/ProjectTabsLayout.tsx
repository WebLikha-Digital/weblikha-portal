'use client'
/**
 * PROJECT TABS LAYOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * The active tab is DERIVED from ?tab= on every render rather than held in
 * state. That is what lets a notification link (?tab=messages&message=…) switch
 * tabs even when the project page is already open. Tab clicks update the URL
 * with history.replaceState, so switching stays instant and refresh keeps the tab.
 *
 * All tab data is fetched once by the parent Server Component and passed down.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { replaceSearchParams } from '@/lib/url-state'
import { TodosTab } from '@/components/modules/projects/TodosTab'
import { MessagesTab } from '@/components/modules/projects/MessagesTab'
import { TeamTab } from '@/components/modules/projects/TeamTab'
import type {
  TaskListWithTasks, MessageWithAuthor, MessageCategory,
  User, ProjectTemplate, ProjectDetail, UserRole,
} from '@/types'

type Tab = 'todos' | 'messages' | 'team'

function isTab(value: string | null): value is Tab {
  return value === 'todos' || value === 'messages' || value === 'team'
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'todos',    label: 'To-dos' },
  { key: 'messages', label: 'Message board' },
  { key: 'team',     label: 'Team' },
]

interface ProjectTabsLayoutProps {
  projectId:        string
  currentUserId:    string
  taskLists:        TaskListWithTasks[]
  messages:         MessageWithAuthor[]
  categories:       MessageCategory[]
  members:          ProjectDetail['members']
  admins:           User[]
  availableMembers: User[]
  templates:        ProjectTemplate[]
  isAdmin:          boolean
  /** Full viewer role — TodosTab derives its per-capability gates from this. */
  viewerRole:       UserRole
}

export function ProjectTabsLayout({
  projectId,
  currentUserId,
  taskLists,
  messages,
  categories,
  members,
  admins,
  availableMembers,
  templates,
  isAdmin,
  viewerRole,
}: ProjectTabsLayoutProps) {
  const searchParams = useSearchParams()
  const tabParam     = searchParams.get('tab')
  const activeTab: Tab = isTab(tabParam) ? tabParam : 'todos'

  return (
    <>
      {/* Tab bar — scrolls horizontally on narrow screens instead of wrapping */}
      <div className="flex gap-1 border-b border-subtle mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            // Switching tabs closes any open message.
            onClick={() => replaceSearchParams({ tab: tab.key, message: null })}
            aria-current={activeTab === tab.key ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap px-4 py-2.5 text-sm transition-colors duration-150 border-b-2 -mb-px',
              'active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              activeTab === tab.key
                ? 'text-brand border-brand font-medium'
                : 'text-secondary border-transparent hover:text-primary',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — conditional render, all data already in memory */}
      {activeTab === 'todos' && (
        <TodosTab
          taskLists={taskLists}
          projectId={projectId}
          currentUserId={currentUserId}
          members={members}
          admins={admins}
          templates={templates}
          viewerRole={viewerRole}
        />
      )}
      {activeTab === 'messages' && (
        <MessagesTab
          messages={messages}
          categories={categories}
          members={members}
          admins={admins}
          projectId={projectId}
          currentUserId={currentUserId}
          viewerRole={viewerRole}
        />
      )}
      {activeTab === 'team' && (
        <TeamTab
          projectId={projectId}
          members={members}
          availableMembers={availableMembers}
          isAdmin={isAdmin}
          viewerRole={viewerRole}
        />
      )}
    </>
  )
}
