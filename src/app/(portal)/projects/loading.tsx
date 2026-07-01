export default function ProjectsLoading() {
  return (
    <div className="p-6 max-w-5xl animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="h-7 w-28 rounded bg-bg-surface-3 mb-2" />
          <div className="h-4 w-52 rounded bg-bg-surface-3" />
        </div>
        <div className="h-9 w-32 rounded-md bg-bg-surface-3" />
      </div>

      {/* Project cards */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-3.5 w-24 rounded bg-bg-surface-3 mb-2" />
            <div className="h-5 w-48 rounded bg-bg-surface-3 mb-3" />
            <div className="h-3.5 w-36 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  )
}
