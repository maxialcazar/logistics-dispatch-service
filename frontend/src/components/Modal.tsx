import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
export type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';
export type DrawerSide = 'left' | 'right';

interface BaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  bodyClassName?: string;
}

export interface ModalProps extends BaseDialogProps {
  size?: ModalSize;
}

export interface DrawerProps extends BaseDialogProps {
  side?: DrawerSide;
  size?: DrawerSize;
}

const MODAL_SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

const DRAWER_SIZE_CLASSES: Record<DrawerSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

type DialogShellProps = BaseDialogProps &
  (
    | { variant: 'modal'; size: ModalSize; side?: never }
    | { variant: 'drawer'; size: DrawerSize; side: DrawerSide }
  );

function DialogShell({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  bodyClassName,
  variant,
  size,
  side = 'right',
}: DialogShellProps) {
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const lastOutsideFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) return;

    if (
      document.activeElement instanceof HTMLElement &&
      !document.activeElement.closest('[data-dialog-shell="true"]')
    ) {
      lastOutsideFocusRef.current = document.activeElement;
    }

    const handleFocusIn = (e: FocusEvent) => {
      if (
        e.target instanceof HTMLElement &&
        !e.target.closest('[data-dialog-shell="true"]')
      ) {
        lastOutsideFocusRef.current = e.target;
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);
    return () => document.removeEventListener('focusin', handleFocusIn, true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape]);

  useEffect(() => {
    if (!isOpen) return;

    const currentActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousActiveElement =
      currentActive && !panelRef.current?.contains(currentActive)
        ? currentActive
        : lastOutsideFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
      panelRef.current.focus();
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousActiveElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isDrawer = variant === 'drawer';

  const dialogContent = (
    <div
      className={clsx(
        'fixed inset-0 z-[9999] flex',
        isDrawer
          ? side === 'left'
            ? 'items-stretch justify-start'
            : 'items-stretch justify-end'
          : 'items-center justify-center p-3 sm:p-4'
      )}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={closeOnBackdropClick ? onClose : undefined}
      />

      {/* Dialog Surface */}
      <div
        ref={panelRef}
        data-dialog-shell="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={clsx(
          'relative z-10 flex w-full flex-col bg-slate-900 shadow-2xl shadow-black/60 focus:outline-none overflow-hidden',
          isDrawer
            ? clsx(
                'h-full max-h-screen',
                side === 'left'
                  ? 'border-r border-slate-800/80 sm:rounded-r-xl'
                  : 'border-l border-slate-800/80 sm:rounded-l-xl',
                DRAWER_SIZE_CLASSES[size]
              )
            : clsx(
                'max-h-[90vh] rounded-xl border border-slate-800/80',
                MODAL_SIZE_CLASSES[size]
              )
        )}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-base sm:text-lg font-semibold text-white tracking-tight leading-snug truncate"
              >
                {title}
              </h2>
              {subtitle && (
                <p id={subtitleId} className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 -mr-1 inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div
          className={clsx(
            'flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 text-slate-300',
            bodyClassName
          )}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2.5 sm:gap-3 px-4 py-3.5 sm:px-5 sm:py-4 border-t border-slate-800/80 bg-slate-950/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(dialogContent, document.body)
    : dialogContent;
}

/**
 * Reusable accessible centered modal dialog aligned with the Logistics OS dark theme.
 */
export function Modal({ size = 'md', ...props }: ModalProps) {
  return <DialogShell {...props} variant="modal" size={size} />;
}

/**
 * Reusable accessible slide-over side panel sharing the unified Logistics OS dialog primitives.
 */
export function Drawer({ side = 'right', size = 'md', ...props }: DrawerProps) {
  return <DialogShell {...props} variant="drawer" side={side} size={size} />;
}
