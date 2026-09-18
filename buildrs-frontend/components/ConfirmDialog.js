import { AlertTriangle, X } from 'lucide-react';
import { useState, useEffect } from 'react';

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger' }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen && !isVisible) return null;

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative bg-navy-light border border-gray-700 rounded-xl w-full max-w-md shadow-2xl transform transition-all ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${variant === 'danger' ? 'bg-red-500/20' : 'bg-yellow-500/20'}`}>
              <AlertTriangle className={`w-5 h-5 ${variant === 'danger' ? 'text-red-400' : 'text-yellow-400'}`} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
              <p className="text-sm text-gray-400">{message}</p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-navy border border-gray-600 rounded-lg text-white text-sm font-medium hover:bg-navy-light transition-colors">
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
