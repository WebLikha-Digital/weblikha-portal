export default function RevenueLoading() {
  return (
    <div className="p-6 max-w-4xl animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-36 rounded bg-bg-surface-3 mb-2" />
        <div className="h-4 w-64 rounded bg-bg-surface-3" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-3.5 w-20 rounded bg-bg-surface-3 mb-3" />
            <div className="h-7 w-24 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="card p-5 mb-4">
        <div className="h-4 w-32 rounded bg-bg-surface-3 mb-4" />
        <div className="h-48 w-full rounded bg-bg-surface-3" />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-subtle">
          <div className="h-4 w-40 rounded bg-bg-surface-3" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-subtle last:border-0">
            <div className="h-4 w-44 rounded bg-bg-surface-3" />
            <div className="h-4 w-20 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  )
}
