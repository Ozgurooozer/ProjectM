import { useEffect, useRef } from 'react'
import { buildGraphData } from '../../lib/graph'
import { useAppStore } from '../../store/appStore'
import { readNote } from '../../lib/tauri'
import type { GraphNode } from '../../lib/graph'

type SimNode = GraphNode & {
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  index?: number
}

type SimLink = { source: string | SimNode; target: string | SimNode }

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { backlinkIndex, setActiveNote, activeNotePath } = useAppStore()

  useEffect(() => {
    if (!svgRef.current) return

    const { nodes: rawNodes, edges } = buildGraphData(backlinkIndex)
    if (rawNodes.length === 0) return

    let cancelled = false

    async function render() {
      const d3 = await import('d3')
      if (cancelled || !svgRef.current) return

      const nodes: SimNode[] = rawNodes.map((n) => ({ ...n }))

      const svg = d3.select(svgRef.current)
      svg.selectAll('*').remove()

      const width = svgRef.current.clientWidth || 600
      const height = svgRef.current.clientHeight || 400

      const g = svg.append('g')
      svg.call(
        d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.2, 4])
          .on('zoom', (event) => g.attr('transform', event.transform))
      )

      const linkData: SimLink[] = edges.map((e) => ({
        source: e.source,
        target: e.target,
      }))

      const simulation = d3
        .forceSimulation<SimNode>(nodes)
        .force('link', d3.forceLink<SimNode, SimLink>(linkData).id((d) => d.id).distance(80))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(20))

      const link = g.append('g')
        .selectAll<SVGLineElement, SimLink>('line')
        .data(linkData).join('line')
        .attr('stroke', '#3f3f46').attr('stroke-width', 1)

      const node = g.append('g')
        .selectAll<SVGCircleElement, SimNode>('circle')
        .data(nodes).join('circle')
        .attr('r', (d) => 5 + Math.min(d.linkCount * 2, 10))
        .attr('fill', (d) => d.id === activeNotePath ? '#7c3aed' : '#52525b')
        .attr('stroke', (d) => d.id === activeNotePath ? '#a78bfa' : '#71717a')
        .attr('stroke-width', 1.5)
        .attr('cursor', 'pointer')
        .call(
          d3.drag<SVGCircleElement, SimNode>()
            .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
            .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
        )
        .on('click', async (_event, d) => {
          try {
            const content = await readNote(d.id)
            setActiveNote(d.id, content)
          } catch (err) {
            console.error('Could not open note from graph:', err)
          }
        })

      node.append('title').text((d) => d.name)

      const label = g.append('g')
        .selectAll<SVGTextElement, SimNode>('text')
        .data(nodes).join('text')
        .text((d) => d.name)
        .attr('font-size', '10px').attr('fill', '#a1a1aa')
        .attr('text-anchor', 'middle').attr('dy', '20px').attr('pointer-events', 'none')

      simulation.on('tick', () => {
        link
          .attr('x1', (d) => (d.source as SimNode).x ?? 0)
          .attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0)
          .attr('y2', (d) => (d.target as SimNode).y ?? 0)
        node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0)
        label.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0)
      })
    }

    render()
    return () => {
      cancelled = true
    }
  }, [backlinkIndex, activeNotePath])

  if (Object.keys(backlinkIndex).length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
        Open a vault to see the graph
      </div>
    )
  }

  return <svg ref={svgRef} className="w-full h-full bg-zinc-950 rounded" />
}
