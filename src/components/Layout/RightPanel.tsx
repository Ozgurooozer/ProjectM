import { useAppStore } from '../../store/appStore'
import { Backlinks } from '../Backlinks/Backlinks'
import { OutlinePanel } from '../Outline/OutlinePanel'
import { GraphView } from '../Graph/GraphView'
import { SimilarNotesPanel } from '../Similar/SimilarNotesPanel'

const PANEL_TITLES: Record<string, string> = {
  backlinks: 'Backlinks',
  outline: 'Outline',
  graph: 'Graph',
  similar: 'Similar Notes',
}

export function RightPanel() {
  const { rightPanelId } = useAppStore()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
        <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
          {PANEL_TITLES[rightPanelId] ?? rightPanelId}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {rightPanelId === 'backlinks' && <Backlinks />}
        {rightPanelId === 'outline'   && <OutlinePanel />}
        {rightPanelId === 'graph'     && <GraphView />}
        {rightPanelId === 'similar'   && <SimilarNotesPanel />}
      </div>
    </div>
  )
}
