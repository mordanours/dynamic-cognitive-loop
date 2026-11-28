import { ReactNode, useEffect, useRef } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';

/** Slow drifting organic blobs behind the whole app. Static when `still` or reduced-motion. */
export function LivingBackground({ still = false }: { still?: boolean }) {
  const reduce = useReducedMotion();
  const frozen = still || reduce;
  const blobs = [
    { c: 'var(--color-leaf-100)', size: 520, x: '-8%', y: '-12%', dx: 60, dy: 40, d: 26 },
    { c: 'var(--color-sun-100)', size: 420, x: '70%', y: '-6%', dx: -50, dy: 60, d: 32 },
    { c: 'var(--color-mind-100)', size: 460, x: '78%', y: '62%', dx: -70, dy: -40, d: 29 },
    { c: 'var(--color-clay-100)', size: 360, x: '4%', y: '70%', dx: 50, dy: -50, d: 35 },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            width: b.size,
            height: b.size,
            left: b.x,
            top: b.y,
            background: b.c,
            opacity: 0.55,
          }}
          animate={frozen ? undefined : { x: [0, b.dx, 0], y: [0, b.dy, 0], scale: [1, 1.08, 1] }}
          transition={frozen ? undefined : { duration: b.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      {/* faint paper grain */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
    </div>
  );
}

/** Number that tweens to its new value. */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  className = '',
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = Number.isFinite(value) ? value : 0;
    if (reduce) {
      el.textContent = target.toFixed(decimals) + suffix;
      prev.current = target;
      return;
    }
    const controls = animate(prev.current, target, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = v.toFixed(decimals) + suffix;
      },
    });
    prev.current = target;
    return () => controls.stop();
  }, [value, decimals, suffix, reduce]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {(Number.isFinite(value) ? value : 0).toFixed(decimals)}
      {suffix}
    </span>
  );
}

/**
 * A little plant whose growth stage follows a 0–100 value (e.g. DCR).
 * 0: seed, ~25: sprout, ~50: two leaves, ~75: bud, 100: bloom.
 */
export function GrowthSprout({ value, size = 32, still = false }: { value: number; size?: number; still?: boolean }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const reduce = useReducedMotion();
  const stemTop = 44 - (v / 100) * 26; // y of stem tip (lower y = taller)
  const leafScale = Math.min(1, v / 45);
  const leaf2Scale = Math.max(0, Math.min(1, (v - 30) / 35));
  const bloom = Math.max(0, Math.min(1, (v - 65) / 30));
  const spring = { type: 'spring' as const, stiffness: 120, damping: 14 };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <ellipse cx="24" cy="44" rx="13" ry="3" fill="var(--color-paper-3)" />
      <circle cx="24" cy="43" r="3" fill="var(--color-clay-300)" />
      <motion.g
        style={{ originX: '24px', originY: '44px' }}
        animate={still || reduce ? undefined : { rotate: [-2.5, 2.5, -2.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.line
          x1="24"
          y1="44"
          x2="24"
          stroke="var(--color-leaf-600)"
          strokeWidth="2.6"
          strokeLinecap="round"
          initial={{ y2: 44 }}
          animate={{ y2: stemTop }}
          transition={spring}
        />
        <motion.path
          d="M24 34 C18 34 14 30 13 25 C19 24 23 28 24 34 Z"
          fill="var(--color-leaf-400)"
          style={{ originX: '24px', originY: '34px' }}
          initial={{ scale: 0 }}
          animate={{ scale: leafScale, y: (44 - stemTop) * 0.15 - 4 }}
          transition={spring}
        />
        <motion.path
          d="M24 30 C24.5 24 29 20 35 20 C35 26 30.5 30 24 30 Z"
          fill="var(--color-leaf-500)"
          style={{ originX: '24px', originY: '30px' }}
          initial={{ scale: 0 }}
          animate={{ scale: leaf2Scale, y: (44 - stemTop) * 0.1 - 6 }}
          transition={spring}
        />
        <motion.circle
          cx="24"
          r="4.2"
          fill="var(--color-sun-300)"
          stroke="var(--color-sun-600)"
          strokeWidth="1"
          initial={{ scale: 0 }}
          animate={{ scale: bloom, cy: stemTop }}
          transition={spring}
        />
      </motion.g>
    </svg>
  );
}

/** Staggered entrance container + item. */
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
export const rise = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 26 } },
};

/** Segmented control with a sliding pill (shared layoutId per group). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  group,
  size = 'md',
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; activeClass?: string }[];
  group: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={`seg ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onChange(o.value)}
            className={`seg-item ${size === 'sm' ? '!px-2.5 !py-1 !text-xs' : ''}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className={`seg-pill ${o.activeClass || ''}`}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
