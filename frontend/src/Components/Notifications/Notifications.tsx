import React from 'react';

interface NotificationsProps {
  showRecoveryToast: boolean;
  showScaleSavedIndicator: boolean;
}

const Notifications: React.FC<NotificationsProps> = ({
  showRecoveryToast,
  showScaleSavedIndicator,
}) => {
  return (
    <>
      {/* Recovery Toast */}
      {showRecoveryToast && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">Session restored successfully!</span>
        </div>
      )}

      {/* Scale Saved Indicator */}
      {showScaleSavedIndicator && (
        <div className="absolute top-4 right-4 z-50 bg-blue-500 text-white px-3 py-1.5 rounded-md shadow-lg flex items-center gap-2 animate-in slide-in-from-right-2">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs font-medium">Size saved</span>
        </div>
      )}
    </>
  );
};

export default Notifications;