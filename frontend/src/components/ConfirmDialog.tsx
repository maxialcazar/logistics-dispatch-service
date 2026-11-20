
import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import clsx from 'clsx';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
    hideCancel?: boolean;
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'warning',
    isLoading = false,
    hideCancel = false
}: ConfirmDialogProps) {

    const getIcon = () => {
        switch (variant) {
            case 'danger': return <Trash2 className="h-6 w-6 text-red-500" />;
            case 'warning': return <AlertTriangle className="h-6 w-6 text-orange-500" />;
            default: return <Info className="h-6 w-6 text-blue-500" />;
        }
    };

    const getConfirmButtonClass = () => {
        switch (variant) {
            case 'danger': return 'bg-red-600 hover:bg-red-500 shadow-red-900/20';
            case 'warning': return 'bg-orange-600 hover:bg-orange-500 shadow-orange-900/20';
            default: return 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20';
        }
    };

    const handleClose = () => {
        if (!isLoading) {
            onClose();
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={handleClose} 
            title={title}
            footer={(
                <>
                    {!hideCancel && (
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isLoading}
                            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            if (isLoading) return;
                            onConfirm();
                            if (hideCancel) onClose(); // Auto-close if acting as alert
                        }}
                        disabled={isLoading}
                        className={clsx(
                            "px-4 py-2 text-sm font-medium text-white rounded-lg shadow-lg transition-colors border border-transparent flex items-center gap-2",
                            getConfirmButtonClass(),
                            isLoading && "opacity-70 cursor-not-allowed"
                        )}
                    >
                        {isLoading ? 'Procesando...' : (confirmText || 'Confirmar')}
                    </button>
                </>
            )}
        >
            <div className="flex items-start gap-4">
                <div className={clsx("p-3 rounded-xl border flex-shrink-0", 
                    variant === 'danger' && "bg-red-500/10 border-red-500/20",
                    variant === 'warning' && "bg-orange-500/10 border-orange-500/20",
                    variant === 'info' && "bg-blue-500/10 border-blue-500/20"
                )}>
                    {getIcon()}
                </div>
                <div className="space-y-2">
                    <p className="text-slate-300 leading-relaxed">
                        {message}
                    </p>
                </div>
            </div>
        </Modal>
    );
}
