import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildExportHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.75; color: #1a1a1a; background: #ffffff; max-width: 740px; margin: 0 auto; padding: 48px 32px; }
    h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin: 0 0 1em; }
    h2 { font-size: 1.5em; margin: 1.5em 0 0.5em; }
    h3 { font-size: 1.2em; margin: 1.3em 0 0.4em; }
    h4, h5, h6 { margin: 1em 0 0.3em; }
    p { margin: 0.8em 0; }
    a { color: #7c3aed; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 0.875em; }
    pre { background: #f3f4f6; padding: 16px; border-radius: 6px; overflow-x: auto; margin: 1em 0; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #7c3aed; padding: 4px 0 4px 16px; color: #6b7280; margin: 1em 0; }
    ul, ol { padding-left: 1.75em; margin: 0.8em 0; }
    li { margin: 0.3em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    img { max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
    .wiki-link-ref { color: #a78bfa; font-style: italic; }
    .tag-pill { display: inline-block; background: #ede9fe; color: #7c3aed; font-size: 11px; padding: 1px 8px; border-radius: 9999px; margin: 0 2px; }
    footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  ${bodyHtml}
  <footer>Exported from Vault · ${new Date().toLocaleDateString()}</footer>
</body>
</html>`
}

export async function exportToHtml(
  title: string,
  content: string,
  imageCache: Record<string, string>
): Promise<void> {
  const savePath = await save({
    title: 'Export as HTML',
    defaultPath: `${title}.html`,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  })

  if (!savePath) return

  const { marked } = await import('marked')

  let processed = content

  // Replace ![[image]] with base64 img tags
  processed = processed.replace(/!\[\[([^\]]+)\]\]/g, (_, linkName: string) => {
    const dataUrl = imageCache[linkName.trim()]
    if (dataUrl) return `<img src="${dataUrl}" alt="${escapeHtml(linkName)}" />`
    return `[image: ${linkName}]`
  })

  // Replace [[wiki-links]] with styled plain text
  processed = processed.replace(
    /\[\[([^\]]+)\]\]/g,
    '<span class="wiki-link-ref">$1</span>'
  )

  // Replace #tags with pill spans
  processed = processed.replace(
    /#([a-zA-Z0-9_/-]+)/g,
    '<span class="tag-pill">#$1</span>'
  )

  const bodyHtml = marked(processed) as string
  const fullHtml = buildExportHtml(title, bodyHtml)

  await invoke('write_note', { path: savePath, content: fullHtml })
}
