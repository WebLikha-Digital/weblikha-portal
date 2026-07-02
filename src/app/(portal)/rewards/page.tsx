import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Trophy } from 'lucide-react'

export const metadata: Metadata = { title: 'Rewards' }

export default async function RewardsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-primary mb-1">
          Rewards
        </h1>
        <p className="text-sm text-secondary">
          Your monthly incentive points and earned rewards.
        </p>
      </div>

      <div className="card p-12 flex flex-col items-center justify-center text-center gap-4">
        <div className="size-14 rounded-full bg-bg-surface-2 flex items-center justify-center">
          <Trophy className="size-7 text-secondary" aria-hidden />
        </div>
        <div>
          <h2 className="font-display font-semibold text-primary mb-1">
            Coming soon
          </h2>
          <p className="text-sm text-secondary max-w-xs">
            Your point history, monthly totals, and loyalty incentive status
            will appear here. Keep completing tasks on time to earn more points!
          </p>
        </div>
        <div className="mt-2 px-4 py-2 rounded-md bg-bg-surface-2 text-sm text-secondary">
          Incentive threshold: <span className="text-primary font-medium">1,000 pts / month</span>
        </div>
      </div>
    </div>
  )
}
