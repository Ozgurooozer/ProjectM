import { Preview } from './Preview'

interface Props {
  onHide: () => void
}

export function PreviewPanel({ onHide }: Props) {
  return (
    <div className="flex flex-col h-full border-l border-zinc-700">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700 shrink-0">
        <span className="text-xs text-zinc-500">Preview</span>
        <button
          onClick={onHide}
          title="Hide preview"
          className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Preview />
      </div>
    </div>
  )
}
