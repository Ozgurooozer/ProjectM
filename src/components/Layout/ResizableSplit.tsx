import { useRef, useState, useCallback, useEffect } from 'react'

interface Props {
  left: React.ReactNode
  right: React.ReactNode
  defaultLeftPercent?: number
  minLeftPercent?: number
  maxLeftPercent?: number
  showRight?: boolean
}

export function ResizableSplit({
  left,
  right,
  defaultLeftPercent = 55,
  minLeftPercent = 20,
  maxLeftPercent = 80,
  showRight = true,
}: Props) {
  const [leftPercent, setLeftPercent] = useState(defaultLeftPercent)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percent = (x / rect.width) * 100
      setLeftPercent(Math.min(maxLeftPercent, Math.max(minLeftPercent, percent)))
    }

    function handleMouseUp() {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [minLeftPercent, maxLeftPercent])

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div
        style={{ width: showRight ? `${leftPercent}%` : '100%' }}
        className="h-full overflow-hidden transition-none"
      >
        {left}
      </div>

      {showRight && (
        <div
          onMouseDown={handleMouseDown}
          className="w-1 h-full bg-zinc-700 hover:bg-violet-500 cursor-col-resize shrink-0 transition-colors"
        />
      )}

      {showRight && (
        <div
          style={{ width: `${100 - leftPercent}%` }}
          className="h-full overflow-hidden transition-none"
        >
          {right}
        </div>
      )}
    </div>
  )
}
