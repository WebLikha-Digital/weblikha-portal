export default function ClientsLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-5 w-20 bg-bg-surface-3 rounded" />
        <div className="h-3 w-72 bg-bg-surface-3 rounded" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="card px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="size-8 rounded-full bg-bg-surface-3 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-bg-surface-3 rounded" />
              <div className="h-2.5 w-44 bg-bg-surface-3 rounded" />
              <div className="h-4 w-52 bg-bg-surface-3 rounded-full" />
            </div>
            <div className="h-7 w-32 bg-bg-surface-3 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
