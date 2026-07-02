'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TeamPerformanceTable } from './TeamPerformanceTable'
import { MembersTab } from './MembersTab'
import type { User, PerformancePeriod } from '@/types'

type Tab = 'leaderboard' | 'members'

interface ProjectStats {
  userId:    string
  active:    number
  completed: number
  total:     number
}

interface Props {
  providers:    User[]
  periods:      PerformancePeriod[]
  projectStats: ProjectStats[]
  month:        number
  year:         number
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'members',     label: 'Members' },
]

export function TeamTabs({ providers, periods, projectStats, month, year }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard')

  return (
    <div>
      {/* Tab bar — scrolls horizontally on narrow screens instead of wrapping */}
      <div className="flex gap-1 border-b border-subtle mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'shrink-0 whitespace-nowrap px-4 py-2.5 text-sm transition-colors duration-fast border-b-2 -mb-px',
              activeTab === tab.key
                ? 'text-brand border-brand font-medium'
                : 'text-secondary border-transparent hover:text-primary',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'leaderboard' && (
        <TeamPerformanceTable
          providers={providers}
          periods={periods}
          month={month}
          year={year}
        />
      )}

      {activeTab === 'members' && (
        <MembersTab
          providers={providers}
          periods={periods}
          projectStats={projectStats}
        />
      )}
    </div>
  )
}
