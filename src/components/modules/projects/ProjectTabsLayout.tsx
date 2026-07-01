'use client'
/**
 * PROJECT TABS LAYOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages tab state client-side with useState so switching between
 * To-dos / Message board / Team is instant — no server round-trip.
 *
 * All tab data is fetched once by the parent Server Component and passed
 * as props. Tabs switch by toggling visibility, not by navigating.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TodosTab } from '@/components/modules/projects/TodosTab'
import { MessagesTab } from '@/components/modules/projects/MessagesTab'
import { TeamTab } from '@/components/modules/projects/TeamTab'
import type {
  TaskListWithTasks, MessageWithAuthor, ProjectMember,
  User, ProjectTemplate, ProjectDetail,
} from '@/types'

type Tab = 'todos' | 'messages' | 'team'

const TABS: { key: Tab; label: string }[] = [
  { key: 'todos',    label: 'To-dos' },
  { key: 'messages', label: 'Message board' },
  { key: 'team',     label: 'Team' },
]

interface ProjectTabsLayoutProps {
  projectId:        string
  taskLists:        TaskListWithTasks[]
  messages:         MessageWithAuthor[]
  members:          ProjectDetail['members']
  availableMembers: User[]
  templates:        ProjectTemplate[]
  isAdmin:          boolean
}

export function ProjectTabsLayout({
  projectId,
  taskLists,
  messages,
  members,
  availableMembers,
  templates,
  isAdmin,
}: ProjectTabsLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('todos')

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-subtle mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px',
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
          members={members}
          templates={templates}
          isAdmin={isAdmin}
        />
      )}
      {activeTab === 'messages' && (
        <MessagesTab messages={messages} />
      )}
      {activeTab === 'team' && (
        <TeamTab
          projectId={projectId}
          members={members}
          availableMembers={availableMembers}
          isAdmin={isAdmin}
        />
      )}
    </>
  )
}
