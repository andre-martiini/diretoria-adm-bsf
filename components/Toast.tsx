import React, { useEffect } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
    message: string;
    type: ToastType;
    onClose: () => void;
    duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose, duration = 3000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const icons = {
        success: <Check size={20} className="text-white" />,
        error: <X size={20} className="text-white" />,
        warning: <AlertTriangle size={20} className="text-white" />,
        info: <Info size={20} className="text-white" />
    };

    const colors = {
        success: 'bg-emerald-500',
        error: 'bg-red-500',
        warning: 'bg-amber-500',
        info: 'bg-blue-500'
    };

    return (
        <div className={`fixed bottom-4 right-4 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg shadow-black/5 animate-in slide-in-from-bottom-5 duration-300 ${colors[type]}`}>
            <div className="p-1 rounded-full bg-white/20">
                {icons[type]}
            </div>
            <span className="text-sm font-bold text-white pr-2">{message}</span>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors text-white/80 hover:text-white">
                <X size={14} />
            </button>
        </div>
    );
};

export default Toast;
