import type mermaid from 'mermaid'

let mermaidInstance: typeof mermaid | null = null
let initialized = false

async function getMermaid() {
  if (!mermaidInstance) {
    const mod = await import('mermaid')
    mermaidInstance = mod.default
  }
  return mermaidInstance
}

export async function initMermaid() {
  if (initialized) return
  const m = await getMermaid()
  m.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#7c3aed',
      primaryTextColor: '#f4f4f5',
      primaryBorderColor: '#a78bfa',
      lineColor: '#71717a',
      secondaryColor: '#27272a',
      tertiaryColor: '#18181b',
      background: '#18181b',
      mainBkg: '#27272a',
      nodeBorder: '#52525b',
      clusterBkg: '#1c1c1e',
      titleColor: '#f4f4f5',
      edgeLabelBackground: '#27272a',
      attributeBackgroundColorEven: '#27272a',
      attributeBackgroundColorOdd: '#18181b',
    },
    flowchart: { htmlLabels: true, curve: 'basis' },
    securityLevel: 'loose',
  })
  initialized = true
}

let diagramId = 0

export async function renderMermaid(code: string): Promise<{ svg: string; error: string | null }> {
  try {
    await initMermaid()
    const m = await getMermaid()
    const id = `mermaid-${++diagramId}`
    const { svg } = await m.render(id, code)
    return { svg, error: null }
  } catch (err) {
    return { svg: '', error: String(err) }
  }
}
