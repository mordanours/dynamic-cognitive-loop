import { motion } from 'motion/react';

interface Props {
  size?: number;
  animated?: boolean;
  className?: string;
}

/** Brand mark: a sprout growing inside a feedback loop. Mirrors /public/favicon.svg. */
export function Logo({ size = 36, animated = true, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Cognitive Loop"
    >
      <rect width="64" height="64" rx="16" fill="var(--color-leaf-600)" />
      <motion.g
        style={{ originX: '32px', originY: '34px' }}
        animate={animated ? { rotate: [0, 360] } : undefined}
        transition={animated ? { duration: 24, repeat: Infinity, ease: 'linear' } : undefined}
      >
        <path
          d="M52 34 A20 20 0 1 1 44.86 18.68"
          fill="none"
          stroke="#fbfaf6"
          strokeWidth="4.5"
          strokeLinecap="round"
          opacity="0.92"
        />
        <path d="M49.2 22.4 L41.6 22.2 L47.3 15.1 Z" fill="#fbfaf6" opacity="0.92" />
      </motion.g>
      <path d="M32 44 C32 39 32 35 32 31" fill="none" stroke="#fbfaf6" strokeWidth="3.2" strokeLinecap="round" />
      <motion.path
        d="M32 36 C27.5 36 24 33 23 28.5 C27.8 27.8 31.2 31 32 36 Z"
        fill="var(--color-leaf-200)"
        style={{ originX: '32px', originY: '36px' }}
        animate={animated ? { rotate: [0, -8, 0] } : undefined}
        transition={animated ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />
      <motion.path
        d="M32 32 C32.4 26.8 35.8 23.4 40.8 23.4 C40.8 28.6 37.4 32 32 32 Z"
        fill="var(--color-sun-300)"
        style={{ originX: '32px', originY: '32px' }}
        animate={animated ? { rotate: [0, 7, 0] } : undefined}
        transition={animated ? { duration: 4.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 } : undefined}
      />
    </svg>
  );
}
