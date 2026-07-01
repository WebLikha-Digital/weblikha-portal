import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ApprovalQueue } from '@/components/modules/settings/ApprovalQueue'
import { TemplateBuilder } from '@/components/modules/settings/TemplateBuilder'
import type { ProjectTemplateWithLists, User } from '@/types'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Pending approvals
  const { data: pendingRaw } = await supabase
    .from('users')
    .select('*')
    .eq('approved', false)
    .order('created_at', { ascending: true })

  const pending = (pendingRaw ?? []) as User[]

  // Templates with nested phases + tasks
  const { data: templatesRaw } = await supabase
    .from('project_templates')
    .select(`
      *,
      task_lists: template_task_lists (
        *,
        tasks: template_tasks (*)
      )
    `)
    .order('name', { ascending: true })

  const templates = ((templatesRaw ?? []) as ProjectTemplateWithLists[]).map(t => ({
    ...t,
    task_lists: [...t.task_lists]
      .sort((a, b) => a.position - b.position)
      .map(l => ({
        ...l,
        tasks: [...l.tasks].sort((a, b) => a.position - b.position),
      })),
  }))

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-xl font-display font-semibold text-primary">Settings</h1>
        <p className="text-sm text-secondary mt-1">
          Manage approvals, task list templates, and agency preferences.
        </p>
      </div>

      {/* Pending Approvals */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-medium text-primary">Pending Approvals</h2>
          {pending.length > 0 && (
            <span className="text-2xs font-medium bg-brand text-bg-base px-1.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </div>
        <ApprovalQueue pending={pending} />
      </section>

      {/* Task List Templates */}
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-medium text-primary">Task List Templates</h2>
          <p className="text-sm text-secondary mt-0.5">
            Templates bundle phases and tasks you can stamp onto any project.
          </p>
        </div>
        <TemplateBuilder templates={templates} />
      </section>
    </div>
  )
}
