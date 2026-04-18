interface OrionLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  textClassName?: string;
}

export function OrionMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2.25" />
      <circle cx="14" cy="14" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <circle cx="14" cy="14" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function OrionLogo({ size = 28, showText = true, className = '', textClassName = '' }: OrionLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <OrionMark size={size} className="text-primary" />
      {showText && (
        <span
          className={`font-semibold tracking-tight text-foreground ${textClassName}`}
          style={{ fontSize: size * 0.64, letterSpacing: '-0.02em' }}
        >
          Orion
        </span>
      )}
    </div>
  );
}
