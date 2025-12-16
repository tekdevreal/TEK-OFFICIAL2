import { useEffect, useState } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { fetchRewards, fetchPayouts } from '../services/api';
import './Notifications.css';

interface NotificationState {
  lowBalance: boolean;
  failedPayouts: number;
  apiErrors: number;
}

export function NotificationManager() {
  const [notificationState, setNotificationState] = useState<NotificationState>({
    lowBalance: false,
    failedPayouts: 0,
    apiErrors: 0,
  });

  // Low balance threshold: 0.1 SOL (not used directly, but kept for reference)

  useEffect(() => {
    const checkNotifications = async () => {
      try {
        // Check rewards for balance info
        const rewards = await fetchRewards();
        
        // Check for low balance (if backend provides balance info)
        // For now, we'll check if total SOL distributed is close to reward pool
        if (!rewards || !rewards.statistics) {
          return;
        }
        
        const totalSOL = rewards.statistics?.totalSOLDistributed || 0;
        const pendingPayouts = rewards.statistics?.pendingPayouts || 0;
        
        // Estimate if we might run out of SOL
        if (pendingPayouts > 0 && totalSOL > 0.9) {
          if (!notificationState.lowBalance) {
            toast.warning(
              `Low reward pool: ${(totalSOL || 0).toFixed(6)} SOL remaining. ${pendingPayouts} payouts pending.`,
              {
                autoClose: 10000,
                toastId: 'low-balance',
              }
            );
            setNotificationState(prev => ({ ...prev, lowBalance: true }));
          }
        } else {
          setNotificationState(prev => ({ ...prev, lowBalance: false }));
        }

        // Check for failed payouts
        const payouts = await fetchPayouts({ limit: 1000 });
        const failedCount = payouts.summary?.failed || 0;
        
        if (failedCount > 0 && failedCount !== notificationState.failedPayouts) {
          toast.error(
            `${failedCount} payout(s) have failed. Check Distribution page for details.`,
            {
              autoClose: 10000,
              toastId: 'failed-payouts',
            }
          );
          setNotificationState(prev => ({ ...prev, failedPayouts: failedCount }));
        } else if (failedCount === 0 && notificationState.failedPayouts > 0) {
          setNotificationState(prev => ({ ...prev, failedPayouts: 0 }));
        }
      } catch (error) {
        const errorCount = notificationState.apiErrors + 1;
        if (errorCount <= 3) {
          toast.error(
            `API Error: ${error instanceof Error ? error.message : 'Failed to fetch data'}`,
            {
              autoClose: 8000,
              toastId: `api-error-${Date.now()}`,
            }
          );
          setNotificationState(prev => ({ ...prev, apiErrors: errorCount }));
        }
      }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 60000);
    return () => clearInterval(interval);
  }, [notificationState]);

  return (
    <ToastContainer
      position="top-right"
      autoClose={8000}
      hideProgressBar={false}
      newestOnTop={true}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="light"
    />
  );
}

// Helper function to show custom notifications
export function showNotification(
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info'
) {
  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'warning':
      toast.warning(message);
      break;
    default:
      toast.info(message);
  }
}

