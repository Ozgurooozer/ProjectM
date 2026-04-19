import { save } from '@tauri-apps/plugin-dialog'
import { backupVault } from './tauri'

export async function createVaultBackup(vaultPath: string): Promise<void> {
  const vaultName = vaultPath.split(/[\\/]/).pop() ?? 'vault'
  const date = new Date().toISOString().split('T')[0]
  const defaultName = `${vaultName}-backup-${date}.zip`

  const savePath = await save({
    title: 'Save Vault Backup',
    defaultPath: defaultName,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  })

  if (!savePath) return

  await backupVault(vaultPath, savePath)
}
