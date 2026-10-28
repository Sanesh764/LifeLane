import React from 'react';
import { CheckCircleIcon, AlertTriangleIcon, OctagonAlertIcon, InfoIcon } from './Icons.jsx';

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => {
        let Icon = InfoIcon;
        if (toast.type === 'success') Icon = CheckCircleIcon;
        if (toast.type === 'warning') Icon = AlertTriangleIcon;
        if (toast.type === 'error') Icon = OctagonAlertIcon;

        return (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            <span className="toast__icon">
              <Icon size={18} />
            </span>
            <div className="toast__text">
              {toast.title && <div className="toast__title">{toast.title}</div>}
              <div className="toast__message">{toast.message}</div>
            </div>
            <button
              className="toast__close"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
