import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { saveSettings } from '../../lib/persistence'
import { createVaultBackup } from '../../lib/backup'
import { FileRecovery } from '../Recovery/FileRecovery'
import { AIStatusPanel } from './AIStatusPanel'

interface Props {
  onClose: () => void
  initialTab?: 'general' | 'ai'
}

export function Settings({ onClose, initialTab = 'general' }: Props) {
  const { settings, updateSettings, vaultPath, activeNotePath } = useAppStore()
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupStatus, setBackupStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [showRecovery, setShowRecovery] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'ai'>(initialTab)

  async function handleFontSize(size: number) {
    const newSettings = { ...settings, fontSize: size }
    updateSettings(newSettings)
    await saveSettings(newSettings)
  }

  async function handleTheme(theme: 'dark' | 'light') {
    const newSettings = { ...settings, theme }
    updateSettings(newSettings)
    await saveSettings(newSettings)
  }

  async function handleBackup() {
    if (!vaultPath) return
    setIsBackingUp(true)
    setBackupStatus('idle')
    try {
      await createVaultBackup(vaultPath)
      setBackupStatus('done')
    } catch (err) {
      console.error('Backup failed:', err)
      setBackupStatus('error')
    } finally {
      setIsBackingUp(false)
      setTimeout(() => setBackupStatus('idle'), 3000)
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-zinc-800 border border-zinc-700 rounded-lg p-5 w-80 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-sm font-medium text-zinc-200">Settings</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700 mb-4 -mx-5 px-5 shrink-0">
          <button
            onClick={() => setSettingsTab('general')}
            className={`text-xs py-2 px-3 transition-colors ${
              settingsTab === 'general'
                ? 'text-zinc-200 border-b-2 border-violet-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setSettingsTab('ai')}
            className={`text-xs py-2 px-3 transition-colors ${
              settingsTab === 'ai'
                ? 'text-zinc-200 border-b-2 border-violet-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            🧠 AI
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {settingsTab === 'general' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-zinc-500 mb-2">Editor Font Size</p>
                <div className="flex gap-2">
                  {[12, 14, 16, 18].map((size) => (
                    <button
                      key={size}
                      onClick={() => handleFontSize(size)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        settings.fontSize === size
                          ? 'bg-violet-600 text-white'
                          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-zinc-500 mb-2">Theme</p>
                <div className="flex gap-2">
                  {(['dark', 'light'] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => handleTheme(theme)}
                      className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
                        settings.theme === theme
                          ? 'bg-violet-600 text-white'
                          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                    >
                      {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
                    </button>
                  ))}
                </div>
              </div>

              {vaultPath && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Daily Notes Location</p>
                  <p className="text-xs text-zinc-600 font-mono truncate">
                    {vaultPath}/Daily Notes/YYYY-MM-DD.md
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs text-zinc-500 mb-2">Backup</p>
                <button
                  onClick={handleBackup}
                  disabled={!vaultPath || isBackingUp}
                  className="w-full text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 rounded px-3 py-1.5 transition-colors"
                >
                  {isBackingUp ? '⏳ Creating backup...' : '📦 Backup Vault as ZIP'}
                </button>
                {backupStatus === 'done' && (
                  <p className="text-xs text-green-400 mt-1">✓ Backup saved successfully</p>
                )}
                {backupStatus === 'error' && (
                  <p className="text-xs text-red-400 mt-1">✗ Backup failed</p>
                )}
              </div>

              <div>
                <p className="text-xs text-zinc-500 mb-2">File Recovery</p>
                <button
                  onClick={() => {
                    onClose()
                    setShowRecovery(true)
                  }}
                  disabled={!activeNotePath}
                  className="w-full text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-200 rounded px-3 py-1.5 transition-colors"
                >
                  🕐 View Snapshots
                </button>
                <p className="text-xs text-zinc-700 mt-1">
                  Snapshots saved automatically on each write
                </p>
              </div>
            </div>
          )}

          {settingsTab === 'ai' && <AIStatusPanel />}
        </div>
      </div>
    </div>

    {showRecovery && <FileRecovery onClose={() => setShowRecovery(false)} />}
    </>
  )
}
