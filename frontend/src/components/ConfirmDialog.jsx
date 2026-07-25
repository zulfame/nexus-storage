import { useState } from "react";
import { AlertTriangle, Trash2, Loader2, X } from "lucide-react";

export function ConfirmDialog({
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  icon: Icon = danger ? Trash2 : AlertTriangle,
  onConfirm,
  onClose,
}) {
  const [working, setWorking] = useState(false);

  const handleConfirm = async () => {
    setWorking(true);
    try {
      await onConfirm?.();
      onClose?.();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={() => !working && onClose?.()}
    >
      <div
        className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 relative"
        data-testid="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => !working && onClose?.()}
          aria-label="Close"
          data-testid="confirm-close"
          className="absolute top-3.5 right-3.5 h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
        <div className="p-6 flex flex-col items-center text-center">
          <span
            className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-4 ${
              danger ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"
            }`}
          >
            <Icon size={26} />
          </span>
          <h3 className="font-display font-bold text-lg tracking-tight text-gray-900" data-testid="confirm-title">
            {title}
          </h3>
          {message && (
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed" data-testid="confirm-message">
              {message}
            </p>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-2.5">
          <button
            onClick={() => onClose?.()}
            disabled={working}
            data-testid="confirm-cancel-button"
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={working}
            data-testid="confirm-accept-button"
            className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl text-white transition-colors shadow-sm disabled:opacity-70 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-blue-700"
            }`}
          >
            {working && <Loader2 size={15} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
