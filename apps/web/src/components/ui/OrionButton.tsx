import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface OrionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  icon?: ReactNode;
  iconRight?: boolean;
  children?: ReactNode;
}

/**
 * Orion Button component - implements the editorial button design.
 * Square, no border-radius, with optional icon support.
 */
export const OrionButton = forwardRef<HTMLButtonElement, OrionButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading,
      icon,
      iconRight,
      children,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 font-sans font-medium transition-all duration-100 outline-none focus-visible:outline-2 focus-visible:outline-offset-2';

    const variants = {
      primary:
        'bg-primary text-white border border-primary hover:bg-primary/90 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-primary',
      secondary:
        'bg-surface border border-[hsl(var(--border))] text-foreground hover:bg-[hsl(var(--surface-raised))] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed',
      ghost:
        'bg-transparent border border-transparent text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed',
      outline:
        'bg-transparent border border-[hsl(var(--border))] text-foreground hover:bg-[hsl(var(--surface-raised))] disabled:opacity-50 disabled:cursor-not-allowed',
      danger:
        'bg-[hsl(var(--bad))] text-white border border-[hsl(var(--bad))] hover:opacity-90 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed',
    };

    const sizes = {
      sm: 'h-7 px-3 text-[12px]',
      md: 'h-9 px-4 text-[13px]',
      lg: 'h-11 px-6 text-[14px]',
      icon: 'w-9 h-9 p-0',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          'border-radius-0 no-rounded',
          className,
        )}
        {...props}
      >
        {icon && !iconRight && <span className="flex-shrink-0">{icon}</span>}
        {children && !isLoading && children}
        {isLoading && <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
        {icon && iconRight && <span className="flex-shrink-0">{icon}</span>}
      </button>
    );
  },
);

OrionButton.displayName = 'OrionButton';
