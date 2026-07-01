import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BarChart3 } from 'lucide-react'

export const metadata: Metadata = { title: 'Revenue' }

export default async function RevenuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-primary mb-1">
          Revenue
        </h1>
        <p className="text-sm text-secondary">
          Income, expenses, and per-project financial breakdown.
        </p>
      </div>

      <div className="card p-12 flex flex-col items-center justify-center text-center gap-4">
        <div className="size-14 rounded-full bg-bg-surface-2 flex items-center justify-center">
          <BarChart3 className="size-7 text-secondary" aria-hidden />
        </div>
        <div>
          <h2 className="font-display font-semibold text-primary mb-1">
            Coming soon
          </h2>
          <p className="text-sm text-secondary max-w-xs">
            Revenue charts, expense tracking, and per-project financial
            summaries will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}
