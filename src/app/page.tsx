import { redirect } from 'next/navigation'

// Root route — redirect to dashboard (portal layout will handle auth check)
export default function RootPage() {
  redirect('/dashboard')
}
