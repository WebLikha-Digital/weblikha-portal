export default function SettingsLoading() {
  return (
    <div className="p-6 max-w-5xl animate-pulse">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="h-5 w-20 bg-bg-surface-3 rounded" />
        <div className="h-3 w-64 bg-bg-surface-3 rounded" />
      </div>
      {/* Pending approvals section */}
      <div className="mb-10 space-y-3">
        <div className="h-3 w-36 bg-bg-surface-3 rounded" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-3 px-4 py-3">
            <div className="size-8 rounded-full bg-bg-surface-3 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-28 bg-bg-surface-3 rounded" />
              <div className="h-2.5 w-40 bg-bg-surface-3 rounded" />
            </div>
            <div className="h-7 w-20 bg-bg-surface-3 rounded-md" />
          </div>
        ))}
      </div>
      {/* Templates section */}
      <div className="space-y-3">
        <div className="h-3 w-40 bg-bg-surface-3 rounded" />
        <div className="flex gap-4 h-64">
          <div className="w-52 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 bg-bg-surface-3 rounded-lg" />
            ))}
          </div>
          <div className="flex-1 card" />
        </div>
      </div>
    </div>
  )
}
