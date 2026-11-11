import { errorMessage as formatError, NotifyLevel } from '@soup/sdk';

import { NotificationService } from '../../shared/components/s-toast/toast.service';
import { ToastLevel } from '../../shared/components/s-toast/toast_type.enum';

// How long a notification of a package stays on screen
const NOTIFY_MS = 4000;

const LEVELS: Record<NotifyLevel, ToastLevel> = {
  info: ToastLevel.Success,
  success: ToastLevel.Success,
  warning: ToastLevel.Warning,
  error: ToastLevel.Error
};

/**
 * Show a notification of the host or of a package element with the
 * host's toast.
 */
export function notify(notifications: NotificationService, message: string, level: NotifyLevel = 'info'): void {
  notifications.show(message, LEVELS[level] ?? ToastLevel.Success, NOTIFY_MS);
}

/** The message of an error answered by V3ApiService (an ApiResponse) or thrown. */
export function errorMessage(error: unknown): string {
  return formatError(error);
}
