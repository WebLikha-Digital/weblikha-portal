'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'todos',    label: 'To-dos' },
  { key: 'messages', label: 'Message board' },
  { key: 'team',     label: 'Team' },
] as const

interface ProjectTabsProps {
  projectId: string
}

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'todos'

  return (
    <div className="flex gap-1 border-b border-subtle mb-6">
      {TABS.map(tab => (
        <Link
          key={tab.key}
          href={`/projects/${projectId}?tab=${tab.key}`}
          className={cn(
            'px-4 py-2.5 text-sm transition-colors duration-fast border-b-2 -mb-px',
            activeTab === tab.key
              ? 'text-brand border-brand font-medium'
              : 'text-secondary border-transparent hover:text-primary',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
