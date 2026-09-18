import type { MessageCategory } from '@/types'

interface MessageCategoryPillProps {
  category: Pick<MessageCategory, 'id' | 'name' | 'emoji' | 'archived_at'> | null
}

/** Emoji + name. Archived categories still display on the posts that use them. */
export function MessageCategoryPill({ category }: MessageCategoryPillProps) {
  if (!category) return null
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-2xs text-secondary bg-bg-surface-3 px-2 py-0.5 rounded-full">
      <span aria-hidden>{category.emoji}</span>
      {category.name}
    </span>
  )
}
