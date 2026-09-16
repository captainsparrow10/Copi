/**
 * Copi brand: a two-tone medical plus on a rounded tile (teal vertical, mint
 * horizontal) and the lowercase "copi" wordmark with a mint dot on the i.
 */
interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <rect width="40" height="40" rx="12" fill="var(--brand-tile)" />
      <rect x="17" y="9" width="6" height="22" rx="3" fill="var(--brand-teal)" />
      <rect x="9" y="17" width="22" height="6" rx="3" fill="var(--mint)" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="copi">
      <LogoMark size={size} />
      <span aria-hidden="true" className="text-2xl leading-none font-semibold tracking-[-0.035em] text-foreground">
        cop
        <span className="relative inline-block">
          ı
          <span className="absolute top-[-0.08em] left-1/2 size-[0.2em] -translate-x-1/2 rounded-full bg-mint" />
        </span>
      </span>
    </span>
  );
}
