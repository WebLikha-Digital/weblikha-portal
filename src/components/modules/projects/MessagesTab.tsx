import { Avatar } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { MessageSquare, Eye, Plus } from 'lucide-react'
import type { MessageWithAuthor } from '@/types'

interface MessagesTabProps {
  messages: MessageWithAuthor[]
}

export function MessagesTab({ messages }: MessagesTabProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MessageSquare className="size-8 text-tertiary mb-3" />
        <p className="text-primary font-medium">No messages yet</p>
        <p className="text-sm text-secondary mt-1">Post a milestone update or FYI for the team.</p>
        <button className="mt-4 flex items-center gap-2 h-8 px-3 rounded-md border border-subtle text-sm text-secondary hover:text-primary hover:border-[var(--color-border-default)] transition-colors">
          <Plus className="size-3.5" /> New message
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="flex items-center gap-2 h-8 px-3 rounded-md border border-subtle text-sm text-secondary hover:text-primary hover:border-[var(--color-border-default)] transition-colors">
          <Plus className="size-3.5" /> New message
        </button>
      </div>

      {messages.map(msg => (
        <div
          key={msg.id}
          className="card p-4 hover:border-[var(--color-border-default)] transition-colors cursor-pointer"
        >
          <div className="flex items-start gap-3">
            <Avatar
              name={msg.author?.name ?? 'Unknown'}
              src={msg.author?.avatar_url ?? null}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-medium text-primary truncate">{msg.title}</h3>
                {msg.is_client_visible && (
                  <span className="shrink-0 flex items-center gap-1 text-2xs text-info bg-info/10 px-2 py-0.5 rounded-full">
                    <Eye className="size-3" /> Client sees this
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary line-clamp-2 leading-relaxed">
                {msg.body}
              </p>
              <div className="flex items-center gap-2 mt-2 text-2xs text-tertiary">
                <span>{msg.author?.name ?? 'Unknown'}</span>
                <span>·</span>
                <span>{formatRelative(msg.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
