/**
 * SET PASSWORD — LOADING SKELETON
 * Mirrors the card so there is no layout shift when the form mounts.
 */
export default function SetPasswordLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm animate-pulse">
        <div className="mb-8 flex justify-center">
          <div className="h-12 w-40 rounded bg-bg-surface-3" />
        </div>
        <div className="card flex flex-col gap-4 p-6">
          <div className="h-6 w-40 rounded bg-bg-surface-3" />
          <div className="h-3 w-full rounded bg-bg-surface-3" />
          <div className="h-9 w-full rounded-md bg-bg-surface-3" />
          <div className="h-9 w-full rounded-md bg-bg-surface-3" />
          <div className="h-9 w-full rounded-md bg-bg-surface-3" />
        </div>
      </div>
    </div>
  )
}
