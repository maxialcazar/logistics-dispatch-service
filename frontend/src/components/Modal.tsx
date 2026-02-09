
import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            />
            
            {/* Modal Content */}
            <div className="relative bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md transform transition-all animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-5 border-b border-slate-800">
                    <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
                    <button 
                        onClick={onClose} 
                        className="text-slate-400 hover:text-white hover:bg-slate-800 p-1 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                
                <div className="p-6 text-slate-300">
                    {children}
                </div>

                {footer && (
                    <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-800 bg-slate-950/30 rounded-b-xl">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
