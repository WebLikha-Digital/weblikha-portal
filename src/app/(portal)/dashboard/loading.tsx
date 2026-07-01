export default function DashboardLoading() {
  return (
    <div className="p-6 max-w-5xl animate-pulse">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="h-3 w-20 bg-bg-surface-3 rounded" />
            <div className="h-7 w-16 bg-bg-surface-3 rounded" />
          </div>
        ))}
      </div>
      {/* Content area */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-4">
            <div className="size-8 rounded-full bg-bg-surface-3 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 bg-bg-surface-3 rounded" />
              <div className="h-3 w-24 bg-bg-surface-3 rounded" />
            </div>
            <div className="h-5 w-16 bg-bg-surface-3 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
