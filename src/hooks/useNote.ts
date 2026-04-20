import { useAppStore } from '../store/appStore'
import { readNote, writeNote } from '../lib/tauri'
import { eventBus } from '../lib/events'
import { pathToTitle } from '../lib/wikilinks'

export interface UseNoteReturn {
  activeNotePath: string | null
  noteContent: string
  saveStatus: 'saved' | 'saving' | 'error'
  readingMode: boolean
  noteName: string
  wordCount: number
  openNote: (path: string) => Promise<void>
  clearNote: () => void
  setContent: (content: string) => void
  setSaveStatus: (status: 'saved' | 'saving' | 'error') => void
  toggleReadingMode: () => void
  saveNow: () => Promise<void>
}

export function useNote(): UseNoteReturn {
  const {
    activeNotePath,
    noteContent,
    saveStatus,
    readingMode,
    setActiveNote,
    clearActiveNote,
    setNoteContent,
    setSaveStatus,
    toggleReadingMode,
  } = useAppStore()

  const noteName = activeNotePath ? pathToTitle(activeNotePath) : ''

  const wordCount = noteContent.trim() ? noteContent.trim().split(/\s+/).length : 0

  async function openNote(path: string) {
    const content = await readNote(path)
    setActiveNote(path, content)
    useAppStore.getState().openTab(path)
    eventBus.emit('note:opened', { path, content })
  }

  async function saveNow() {
    if (!activeNotePath) return
    setSaveStatus('saving')
    try {
      await writeNote(activeNotePath, noteContent)
      setSaveStatus('saved')
      eventBus.emit('note:saved', { path: activeNotePath, content: noteContent })
    } catch {
      setSaveStatus('error')
    }
  }

  return {
    activeNotePath,
    noteContent,
    saveStatus,
    readingMode,
    noteName,
    wordCount,
    openNote,
    clearNote: clearActiveNote,
    setContent: setNoteContent,
    setSaveStatus,
    toggleReadingMode,
    saveNow,
  }
}
