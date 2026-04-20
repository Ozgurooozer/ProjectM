import { useEffect, useRef } from 'react'
import { writeNote, saveSnapshot, backlinksSetForNote, tagsSetForNote } from '../../lib/tauri'
import { useAppStore } from '../../store/appStore'
import { updateBacklinkIndex } from '../../lib/backlinks'
import { flattenTree } from '../../lib/wikilinks'
import { updateTagIndex, extractTags } from '../../lib/tags'
import { indexSingleNote } from '../../lib/indexingPipeline'
import { embeddingWorker } from '../../lib/embeddingWorkerManager'
import type { BacklinkEntry } from '../../types'

const AUTOSAVE_DELAY = 1000

export function useAutosave() {
  const { noteContent, activeNotePath, setSaveStatus, vaultPath } = useAppStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')

  // MUST be declared before the autosave effect so it runs first on note switch.
  // This prevents a spurious save of the new note's unmodified content.
  useEffect(() => {
    lastSavedRef.current = noteContent
    setSaveStatus('saved')
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [activeNotePath])

  useEffect(() => {
    if (!activeNotePath) return
    if (noteContent === lastSavedRef.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    setSaveStatus('saving')

    timerRef.current = setTimeout(async () => {
      try {
        await writeNote(activeNotePath, noteContent)
        lastSavedRef.current = noteContent
        setSaveStatus('saved')

        if (vaultPath) {
          saveSnapshot(vaultPath, activeNotePath, noteContent).catch((err) => {
            console.warn('Snapshot save failed:', err)
          })
        }

        const { backlinkIndex, fileTree, setBacklinkIndex, tagIndex, setTagIndex, vectorStore } = useAppStore.getState()
        const allPaths = flattenTree(fileTree)
        const newBacklinks = updateBacklinkIndex(backlinkIndex, activeNotePath, noteContent, allPaths)
        const newTags = updateTagIndex(tagIndex, activeNotePath, noteContent)
        setBacklinkIndex(newBacklinks)
        setTagIndex(newTags)

        // Persist updated backlinks for this note to SQLite (fire-and-forget)
        const outgoingBacklinks = Object.entries(newBacklinks)
          .flatMap(([targetPath, entries]) =>
            entries
              .filter((e: BacklinkEntry) => e.sourcePath === activeNotePath)
              .map((e: BacklinkEntry) => ({ sourcePath: e.sourcePath, targetPath, snippet: e.snippet }))
          )
        backlinksSetForNote(activeNotePath, outgoingBacklinks).catch(console.warn)
        tagsSetForNote(activeNotePath, extractTags(noteContent)).catch(console.warn)

        if (vectorStore && embeddingWorker.getStatus() === 'ready') {
          indexSingleNote(activeNotePath, noteContent, vectorStore).catch((err) => {
            console.warn('Incremental indexing failed:', err)
          })
        }
      } catch (err) {
        console.error('Autosave failed:', err)
        setSaveStatus('error')
      }
    }, AUTOSAVE_DELAY)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [noteContent, activeNotePath])
}
