import { useEffect, useState } from 'react'
import { renderMermaid } from '../../lib/mermaid'

interface Props {
  code: string
}

export function MermaidBlock({ code }: Props) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSvg('')
    setError('')

    renderMermaid(code.trim()).then(({ svg: s, error: e }) => {
      if (cancelled) return
      if (e) setError(e)
      else setSvg(s)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [code])

  if (loading) {
    return <div className="mermaid-loading">Rendering diagram...</div>
  }

  if (error) {
    return (
      <div className="mermaid-error">
        <p className="font-medium mb-1">Diagram error</p>
        <pre className="text-xs overflow-x-auto">{code}</pre>
        <p className="text-xs mt-1 opacity-70">{error}</p>
      </div>
    )
  }

  return (
    <div
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
