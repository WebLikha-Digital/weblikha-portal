/**
 * INPUT COMPONENT
 * ─────────────────────────────────────────────────────────────────────────────
 * A styled wrapper around <input> that respects design tokens.
 * Also exports Textarea for multi-line inputs.
 *
 * USAGE:
 *   <Input placeholder="Project name" />
 *   <Input type="number" label="Budget" prefix="₱" />
 *   <Textarea label="Description" rows={4} />
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const inputBase =
  'w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 px-3 text-sm text-primary placeholder:text-tertiary transition-colors duration-base ' +
  'hover:border-[var(--color-border-strong)] ' +
  'focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

// ── Input ──────────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:   string
  error?:   string
  prefix?:  string
  suffix?:  string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, prefix, suffix, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-xs text-secondary font-medium">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-secondary text-sm select-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              inputBase,
              'h-9',
              prefix && 'pl-7',
              suffix && 'pr-7',
              error  && 'border-danger focus:ring-danger',
              className,
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-secondary text-sm select-none">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="text-2xs text-danger">{error}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'

// ── Textarea ───────────────────────────────────────────────────────────────────

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-xs text-secondary font-medium">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            inputBase,
            'py-2.5 resize-none',
            error && 'border-danger focus:ring-danger',
            className,
          )}
          {...props}
        />
        {error && <p className="text-2xs text-danger">{error}</p>}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'

export { Input, Textarea }
