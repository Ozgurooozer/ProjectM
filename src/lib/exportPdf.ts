import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

export function buildPrintHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 700px;
      margin: 0 auto;
      padding: 40px 32px;
    }
    h1, h2, h3, h4, h5, h6 { margin: 1.4em 0 0.4em; line-height: 1.3; font-weight: 600; }
    h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.2em; }
    p { margin: 0.8em 0; }
    a { color: #7c3aed; text-decoration: underline; }
    code { background: #f3f4f6; padding: 2px 5px; border-radius: 3px; font-size: 0.875em; }
    pre { background: #f3f4f6; padding: 12px 16px; border-radius: 6px; overflow-x: auto; margin: 1em 0; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #7c3aed; padding-left: 16px; color: #6b7280; margin: 1em 0; }
    ul, ol { padding-left: 1.5em; margin: 0.8em 0; }
    li { margin: 0.3em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`
}

export async function exportToPdf(title: string, bodyHtml: string): Promise<void> {
  const savePath = await save({
    title: 'Export as PDF',
    defaultPath: `${title}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (!savePath) return

  await invoke('export_pdf', { html: buildPrintHtml(title, bodyHtml), path: savePath })
}
