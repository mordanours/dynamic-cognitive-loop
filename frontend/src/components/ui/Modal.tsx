import { ReactNode, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class for the panel, e.g. "sm:max-w-lg" */
  maxWidth?: string;
  /** Align panel bottom-right on desktop (used by the capture drawer). */
  align?: 'center' | 'end';
  title?: ReactNode;
  icon?: ReactNode;
  headerExtra?: ReactNode;
  panelClassName?: string;
}

/**
 * Shared modal shell: soft paper backdrop + spring-scaled panel.
 * On mobile the panel slides up as a bottom sheet.
 */
export function Modal({
  open,
  onClose,
  children,
  maxWidth = 'sm:max-w-lg',
  align = 'center',
  title,
  icon,
  headerExtra,
  panelClassName = '',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-backdrop"
          className={`fixed inset-0 z-50 flex items-end bg-ink/30 backdrop-blur-[2px] sm:p-6 ${
            align === 'end' ? 'justify-end sm:items-end' : 'justify-center sm:items-center'
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop sm:rounded-3xl ${maxWidth} ${panelClassName}`}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {title !== undefined && (
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  {icon}
                  <h2 className="truncate text-base font-extrabold text-ink">{title}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {headerExtra}
                  <button onClick={onClose} className="icon-btn" aria-label="关闭">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small rounded icon badge used in modal headers and section titles. */
export function IconBadge({
  children,
  tone = 'leaf',
  size = 'md',
}: {
  children: ReactNode;
  tone?: 'leaf' | 'mind' | 'sun' | 'clay' | 'coral';
  size?: 'sm' | 'md' | 'lg';
}) {
  const tones: Record<string, string> = {
    leaf: 'bg-leaf-50 text-leaf-600',
    mind: 'bg-mind-50 text-mind-600',
    sun: 'bg-sun-50 text-sun-600',
    clay: 'bg-clay-50 text-clay-600',
    coral: 'bg-coral-50 text-coral-600',
  };
  const sizes: Record<string, string> = {
    sm: 'h-7 w-7 rounded-lg',
    md: 'h-9 w-9 rounded-xl',
    lg: 'h-11 w-11 rounded-2xl',
  };
  return <span className={`flex shrink-0 items-center justify-center ${tones[tone]} ${sizes[size]}`}>{children}</span>;
}
