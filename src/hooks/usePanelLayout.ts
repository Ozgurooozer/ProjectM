import { useState, useRef, useEffect } from 'react'
import { loadLayoutState, saveLayoutState } from '../lib/persistence'

export interface PanelLayout {
  leftPanelWidth: number
  rightPanelWidth: number
  isResizingLeft: React.MutableRefObject<boolean>
  isResizingRight: React.MutableRefObject<boolean>
  setLeftPanelWidth: React.Dispatch<React.SetStateAction<number>>
  setRightPanelWidth: React.Dispatch<React.SetStateAction<number>>
}

export function usePanelLayout(): PanelLayout {
  const [leftPanelWidth, setLeftPanelWidth] = useState(240)
  const [rightPanelWidth, setRightPanelWidth] = useState(256)
  const isResizingLeft = useRef(false)
  const isResizingRight = useRef(false)

  // Restore persisted widths on mount
  useEffect(() => {
    loadLayoutState().then((layout) => {
      setLeftPanelWidth(layout.leftPanelWidth)
      setRightPanelWidth(layout.rightPanelWidth)
    })
  }, [])

  // Mouse handlers for panel resize
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (isResizingLeft.current) {
        const w = Math.min(400, Math.max(160, e.clientX - 48))
        setLeftPanelWidth(w)
      }
      if (isResizingRight.current) {
        const w = Math.min(500, Math.max(200, window.innerWidth - e.clientX - 48))
        setRightPanelWidth(w)
      }
    }
    function onMouseUp() {
      if (isResizingLeft.current) {
        isResizingLeft.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setLeftPanelWidth((w) => { void saveLayoutState({ leftPanelWidth: w }); return w })
      }
      if (isResizingRight.current) {
        isResizingRight.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setRightPanelWidth((w) => { void saveLayoutState({ rightPanelWidth: w }); return w })
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return { leftPanelWidth, rightPanelWidth, isResizingLeft, isResizingRight, setLeftPanelWidth, setRightPanelWidth }
}
