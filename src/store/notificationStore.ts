import { create } from 'zustand'

type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface Notification {
  id: string
  type: NotificationType
  message: string
  duration?: number
}

interface NotificationStore {
  notifications: Notification[]
  addNotification: (message: string, type: NotificationType, duration?: number) => void
  removeNotification: (id: string) => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (message, type, duration = 4000) => {
    const id = `${Date.now()}-${Math.random()}`
    set((state) => ({
      notifications: [...state.notifications, { id, message, type, duration }],
    }))
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      }, duration)
    }
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  clearAll: () => set({ notifications: [] }),
}))
