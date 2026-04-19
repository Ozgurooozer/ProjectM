import { useState, useEffect } from 'react'

interface ToastItem {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
}

type ToastListener = (item: ToastItem) => void

let nextId = 0
const listeners: ToastListener[] = []

export function showToast(
  message: string,
  type: ToastItem['type'] = 'info'
): void {
  const item: ToastItem = { id: ++nextId, message, type }
  for (const fn of listeners) fn(item)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    function add(item: ToastItem) {
      setToasts((prev) => [...prev, item])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id))
      }, 3000)
    }
    listeners.push(add)
    return () => {
      const idx = listeners.indexOf(add)
      if (idx !== -1) listeners.splice(idx, 1)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded shadow-lg text-sm animate-slide-in-up max-w-xs ${
            t.type === 'success'
              ? 'bg-green-800 text-green-100 border border-green-600'
              : t.type === 'error'
              ? 'bg-red-900 text-red-100 border border-red-700'
              : 'bg-zinc-700 text-zinc-100 border border-zinc-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
