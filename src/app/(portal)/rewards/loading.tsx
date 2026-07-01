export default function RewardsLoading() {
  return (
    <div className="p-6 max-w-2xl animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-32 rounded bg-bg-surface-3 mb-2" />
        <div className="h-4 w-56 rounded bg-bg-surface-3" />
      </div>

      {/* Points summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-3.5 w-24 rounded bg-bg-surface-3 mb-3" />
            <div className="h-8 w-20 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>

      {/* History */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-subtle">
          <div className="h-4 w-28 rounded bg-bg-surface-3" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-subtle last:border-0">
            <div className="h-4 w-40 rounded bg-bg-surface-3" />
            <div className="h-5 w-12 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  )
}
