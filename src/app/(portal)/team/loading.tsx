export default function TeamLoading() {
  return (
    <div className="p-6 max-w-5xl animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-20 rounded bg-bg-surface-3 mb-2" />
        <div className="h-4 w-80 rounded bg-bg-surface-3" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-subtle mb-6">
        <div className="h-9 w-28 rounded bg-bg-surface-3 mr-2" />
        <div className="h-9 w-24 rounded bg-bg-surface-3" />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-6 px-4 py-2.5 border-b border-subtle">
          <div className="h-3 w-32 rounded bg-bg-surface-3" />
          <div className="h-3 w-16 rounded bg-bg-surface-3 ml-auto" />
          <div className="h-3 w-12 rounded bg-bg-surface-3" />
          <div className="h-3 w-12 rounded bg-bg-surface-3" />
          <div className="h-3 w-12 rounded bg-bg-surface-3" />
          <div className="h-3 w-14 rounded bg-bg-surface-3" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-subtle last:border-0">
            <div className="size-8 rounded-full bg-bg-surface-3 shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-36 rounded bg-bg-surface-3 mb-1.5" />
              <div className="h-3 w-20 rounded bg-bg-surface-3" />
            </div>
            <div className="h-5 w-16 rounded-full bg-bg-surface-3" />
            <div className="h-4 w-8 rounded bg-bg-surface-3 ml-6" />
            <div className="h-4 w-8 rounded bg-bg-surface-3" />
            <div className="h-4 w-8 rounded bg-bg-surface-3" />
            <div className="h-4 w-10 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  )
}
