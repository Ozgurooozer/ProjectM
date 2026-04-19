import { useNotificationStore } from '../store/notificationStore'

export function NotificationCenter() {
  const { notifications, removeNotification } = useNotificationStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notif) => {
        const bgColor = {
          success: 'bg-emerald-900 border-emerald-700',
          error: 'bg-red-900 border-red-700',
          warning: 'bg-amber-900 border-amber-700',
          info: 'bg-blue-900 border-blue-700',
        }[notif.type]

        const textColor = {
          success: 'text-emerald-200',
          error: 'text-red-200',
          warning: 'text-amber-200',
          info: 'text-blue-200',
        }[notif.type]

        const icon = {
          success: '✓',
          error: '✕',
          warning: '⚠',
          info: 'ℹ',
        }[notif.type]

        return (
          <div
            key={notif.id}
            className={`${bgColor} border rounded-lg p-4 flex items-start gap-3 animate-slide-in-up`}
          >
            <span className={`flex-shrink-0 font-bold text-lg ${textColor}`}>{icon}</span>
            <p className={`flex-1 text-sm ${textColor}`}>{notif.message}</p>
            <button
              onClick={() => removeNotification(notif.id)}
              className={`flex-shrink-0 ${textColor} hover:opacity-70 transition-opacity`}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
