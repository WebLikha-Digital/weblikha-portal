export default function ProfileLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl animate-pulse">
      <div className="mb-8">
        <div className="h-6 w-32 rounded bg-bg-surface-3" />
        <div className="mt-2 h-4 w-64 rounded bg-bg-surface-3" />
      </div>

      <div className="max-w-2xl space-y-8">
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-bg-surface-3" />
          <div className="h-8 w-32 rounded bg-bg-surface-3" />
        </div>

        {/* About, Contact, Company, Preferences — a client's page always shows all
            four; over-drawing on a provider/admin page (no Company section) is
            preferable to a layout shift once the real page loads. */}
        {[0, 1, 2, 3].map(section => (
          <div key={section} className="space-y-4">
            <div className="h-4 w-24 rounded bg-bg-surface-3" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-10 rounded bg-bg-surface-3" />
              <div className="h-10 rounded bg-bg-surface-3" />
              {section === 0 && (
                <>
                  <div className="h-10 rounded bg-bg-surface-3" />
                  <div className="h-10 rounded bg-bg-surface-3" />
                </>
              )}
            </div>
            {/* About's full-width bio textarea */}
            {section === 0 && <div className="h-20 rounded bg-bg-surface-3" />}
          </div>
        ))}

        <div className="h-10 w-32 rounded bg-bg-surface-3" />
      </div>
    </div>
  )
}
