export default function ProjectDetailLoading() {
  return (
    <div className="p-6 max-w-4xl animate-pulse">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5">
        <div className="h-3 w-14 bg-bg-surface-3 rounded" />
        <div className="h-3 w-3 bg-bg-surface-3 rounded" />
        <div className="h-3 w-28 bg-bg-surface-3 rounded" />
      </div>
      {/* Project header card */}
      <div className="card p-5 mb-6 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-2.5 w-20 bg-bg-surface-3 rounded" />
            <div className="h-5 w-48 bg-bg-surface-3 rounded" />
          </div>
          <div className="h-5 w-20 bg-bg-surface-3 rounded-full" />
        </div>
        <div className="flex gap-5">
          <div className="h-3 w-36 bg-bg-surface-3 rounded" />
          <div className="h-3 w-24 bg-bg-surface-3 rounded" />
        </div>
      </div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-subtle mb-6 pb-px">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-28 bg-bg-surface-3 rounded-t" />
        ))}
      </div>
      {/* Tab content */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-subtle flex items-center gap-3">
              <div className="h-3 w-32 bg-bg-surface-3 rounded" />
              <div className="h-4 w-8 bg-bg-surface-3 rounded-full" />
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-4 py-2.5 border-b border-subtle last:border-b-0">
                <div className="size-4 rounded-full bg-bg-surface-3 shrink-0" />
                <div className="flex-1 h-3 bg-bg-surface-3 rounded" />
                <div className="h-3 w-16 bg-bg-surface-3 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
