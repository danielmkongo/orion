import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

/**
 * Orion Modal/Sheet component - right-slide sheet from Orion design.
 * Full-height panel with smooth slide-in animation.
 */
export function OrionModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className = '',
  size = 'md',
}: ModalProps) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'w-96',
    md: 'w-[680px]',
    lg: 'w-[920px]',
    full: 'w-full',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="fixed inset-0 z-50 flex items-stretch justify-end pointer-events-none">
        <div
          className={cn(
            'pointer-events-auto flex flex-col h-full bg-[hsl(var(--bg))] border-l border-[hsl(var(--rule))]',
            'shadow-2xl overflow-hidden',
            'animate-slide-in',
            sizeClasses[size],
            className,
          )}
          style={{
            animation: 'slideIn 0.28s cubic-bezier(0.2,0.8,0.2,1)',
          }}
        >
          {/* Header */}
          {(title || subtitle) && (
            <div className="flex-shrink-0 border-b border-[hsl(var(--rule))] px-6 py-5">
              {title && (
                <h2
                  className="text-[24px] font-normal leading-tight tracking-tight text-foreground"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {title}
                </h2>
              )}
              {subtitle && <p className="text-[14px] text-muted-foreground mt-2">{subtitle}</p>}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex-shrink-0 border-t border-[hsl(var(--rule))] bg-[hsl(var(--bg))] px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(40px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}

interface ModalHeaderProps {
  children: ReactNode;
  className?: string;
}

export function ModalHeader({ children, className = '' }: ModalHeaderProps) {
  return <div className={cn('pb-4 border-b border-[hsl(var(--rule))]', className)}>{children}</div>;
}

interface ModalContentProps {
  children: ReactNode;
  className?: string;
}

export function ModalContent({ children, className = '' }: ModalContentProps) {
  return <div className={cn('py-4', className)}>{children}</div>;
}

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className = '' }: ModalFooterProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 pt-4 border-t border-[hsl(var(--rule))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
