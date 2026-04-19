import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'

export function SaveStatus() {
  const { saveStatus } = useAppStore()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    if (saveStatus === 'saved') {
      const t = setTimeout(() => setVisible(false), 2000)
      return () => clearTimeout(t)
    }
  }, [saveStatus])

  if (!visible) return null

  const label = { saved: '✓ Saved', saving: '· Saving...', error: '✗ Save failed' }[saveStatus]
  const color = { saved: 'text-zinc-500', saving: 'text-zinc-400', error: 'text-red-400' }[saveStatus]

  return <span className={`text-xs ${color} transition-opacity`}>{label}</span>
}
