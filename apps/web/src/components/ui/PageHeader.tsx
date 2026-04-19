import { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  titleEm?: string; // italic part of title
  subtitle?: string;
  meta?: { label: string; value: string | ReactNode }[];
  actions?: ReactNode;
  className?: string;
}

/**
 * Editorial page header following Orion design system.
 * Features large display serif font, monospace eyebrow, and optional meta info.
 */
export function PageHeader({
  eyebrow,
  title,
  titleEm,
  subtitle,
  meta,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`pb-5 border-b border-[hsl(var(--rule))] mb-7 ${className}`}>
      <div className="grid grid-cols-3 gap-6 items-end">
        {/* Left: eyebrow + title + subtitle */}
        <div className="col-span-2">
          {eyebrow && (
            <div className="flex items-center gap-3 mb-3">
              <span className="eyebrow">{eyebrow}</span>
            </div>
          )}
          
          <h1
            className="text-6xl font-normal leading-[0.92] tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.035em' }}
          >
            {title}
            {titleEm && <em className="italic text-primary font-normal">{titleEm}</em>}
          </h1>

          {subtitle && (
            <p className="text-[15px] text-muted-foreground max-w-2xl mt-2.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right: meta info or actions */}
        {(meta || actions) && (
          <div className="text-right">
            {meta && (
              <div className="space-y-2.5">
                {meta.map(({ label, value }, i) => (
                  <div key={i} className="font-mono text-[11px] text-muted-foreground leading-relaxed">
                    <div className="text-foreground font-semibold">{value}</div>
                    <div className="text-[10px] uppercase tracking-wider opacity-75">{label}</div>
                  </div>
                ))}
              </div>
            )}
            {actions && <div className="mt-4">{actions}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
