/**
 * BUTTON COMPONENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Variants: primary (brand yellow), ghost, danger, outline
 * Sizes:    sm, md (default), lg
 *
 * USAGE:
 *   <Button>Save</Button>
 *   <Button variant="ghost" size="sm">Cancel</Button>
 *   <Button variant="danger" loading={isDeleting}>Delete</Button>
 *   <Button asChild><Link href="/dashboard">Go</Link></Button>
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base styles shared by all variants
  'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        /** Yellow CTA — use for primary actions */
        primary: 'bg-brand text-brand-fg hover:bg-brand-hover active:scale-[0.98]',
        /** Transparent with subtle border — secondary actions */
        outline: 'border border-[var(--color-border-default)] text-primary hover:bg-bg-overlay',
        /** No border, no background — tertiary / inline actions */
        ghost:   'text-secondary hover:text-primary hover:bg-bg-overlay',
        /** Destructive — use sparingly, only for irreversible actions */
        danger:  'bg-danger-bg text-danger-fg border border-danger hover:bg-danger hover:text-bg-base',
      },
      size: {
        sm: 'h-7  px-3  text-xs',
        md: 'h-9  px-4  text-sm',
        lg: 'h-11 px-6  text-md',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size:    'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button while true */
  loading?: boolean
  /** Pass a custom icon component to render before children */
  icon?: React.ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, icon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled ?? loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading
          ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
          : icon
            ? <span className="size-3.5 flex items-center" aria-hidden>{icon}</span>
            : null}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

export { Button, buttonVariants }
