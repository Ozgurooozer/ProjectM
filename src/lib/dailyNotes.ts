import { createFolder, createNote, readNote, writeNote } from './tauri'
import { applyTemplate, todayString, findTemplates } from './templates'
import type { FileNode } from '../types'

const DAILY_FOLDER = 'Daily Notes'

export function getDailyNotePath(vaultPath: string): {
  folderPath: string
  notePath: string
  fileName: string
} {
  const sep = vaultPath.includes('\\') ? '\\' : '/'
  const date = todayString()
  const fileName = `${date}.md`
  const folderPath = `${vaultPath}${sep}${DAILY_FOLDER}`
  const notePath = `${folderPath}${sep}${fileName}`
  return { folderPath, notePath, fileName }
}

export async function openOrCreateDailyNote(
  vaultPath: string,
  fileTree: FileNode[]
): Promise<{ path: string; content: string }> {
  const { folderPath, notePath } = getDailyNotePath(vaultPath)

  try {
    await createFolder(folderPath)
  } catch {
    // Folder already exists — fine
  }

  try {
    const content = await readNote(notePath)
    return { path: notePath, content }
  } catch {
    // Note doesn't exist — create it
  }

  const templates = findTemplates(fileTree)
  const dailyTemplate = templates.find(
    (t) => t.name.toLowerCase().replace(/\.md$/, '') === 'daily note'
  )

  let initialContent = ''

  if (dailyTemplate) {
    try {
      const templateContent = await readNote(dailyTemplate.path)
      const date = todayString()
      initialContent = applyTemplate(templateContent, { title: date, date })
    } catch {
      initialContent = `# ${todayString()}\n\n`
    }
  } else {
    initialContent = `# ${todayString()}\n\n`
  }

  await createNote(notePath)
  await writeNote(notePath, initialContent)

  return { path: notePath, content: initialContent }
}

export function isDailyNote(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\.md$/.test(name)
}
