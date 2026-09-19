/**
 * Shaped like the client dashboard — three stat cards, a project grid (with its
 * own heading row), requests + messages panels, and a "What's due" panel that
 * renders for any client with a dated task. Clients are the newest and largest
 * group of first paints; the admin and provider layouts are close enough that
 * this does not jump for them either.
 */
export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl animate-pulse">
      <div className="mb-6">
        <div className="h-7 w-48 rounded bg-bg-surface-3" />
        <div className="mt-2 h-3 w-64 rounded bg-bg-surface-3" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="h-3 w-20 rounded bg-bg-surface-3" />
            <div className="h-7 w-12 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>

      {/* "Your projects" heading row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-bg-surface-3" />
        <div className="h-3 w-14 rounded bg-bg-surface-3" />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-4">
            {/* Title + status badge, matching ClientProjectCard's top row */}
            <div className="flex items-start justify-between gap-3">
              <div className="h-4 w-32 rounded bg-bg-surface-3" />
              <div className="h-5 w-16 shrink-0 rounded-full bg-bg-surface-3" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-bg-surface-3" />
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-28 rounded bg-bg-surface-3" />
              {/* Avatar stack, bottom-right */}
              <div className="flex -space-x-1.5">
                {Array.from({ length: 3 }).map((_, a) => (
                  <div key={a} className="size-6 rounded-full border-2 border-bg-surface-1 bg-bg-surface-3" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, panel) => (
          <div key={panel} className="card overflow-hidden">
            <div className="border-b border-subtle px-4 py-3">
              <div className="h-4 w-32 rounded bg-bg-surface-3" />
            </div>
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-2.5 last:border-b-0">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-40 rounded bg-bg-surface-3" />
                  <div className="h-3 w-24 rounded bg-bg-surface-3" />
                </div>
                <div className="h-3 w-12 rounded bg-bg-surface-3" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* "What's due" panel */}
      <div className="card overflow-hidden">
        <div className="border-b border-subtle px-4 py-3">
          <div className="h-4 w-20 rounded bg-bg-surface-3" />
        </div>
        {Array.from({ length: 3 }).map((_, row) => (
          <div key={row} className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-2.5 last:border-b-0">
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 rounded bg-bg-surface-3" />
              <div className="h-3 w-24 rounded bg-bg-surface-3" />
            </div>
            <div className="h-3 w-12 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  )
}
