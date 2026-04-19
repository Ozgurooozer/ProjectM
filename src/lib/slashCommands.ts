export interface SlashCommand {
  trigger: string
  label: string
  description: string
  icon: string
  insert: () => string
}

function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { trigger: 'h1',      label: 'Heading 1',        description: 'Large section heading',       icon: 'H1',  insert: () => '# ' },
  { trigger: 'h2',      label: 'Heading 2',        description: 'Medium section heading',      icon: 'H2',  insert: () => '## ' },
  { trigger: 'h3',      label: 'Heading 3',        description: 'Small section heading',       icon: 'H3',  insert: () => '### ' },
  { trigger: 'ul',      label: 'Bullet list',      description: 'Unordered list item',         icon: '•',   insert: () => '- ' },
  { trigger: 'ol',      label: 'Numbered list',    description: 'Ordered list item',           icon: '1.', insert: () => '1. ' },
  { trigger: 'todo',    label: 'To-do item',       description: 'Checkbox task',               icon: '☐',   insert: () => '- [ ] ' },
  { trigger: 'code',    label: 'Code block',       description: 'Fenced code block',           icon: '</>', insert: () => '```\n\n```' },
  { trigger: 'quote',   label: 'Quote',            description: 'Blockquote',                  icon: '❝',   insert: () => '> ' },
  { trigger: 'hr',      label: 'Divider',          description: 'Horizontal rule',             icon: '—',   insert: () => '\n---\n' },
  { trigger: 'table',   label: 'Table',            description: '3-column markdown table',     icon: '⊞',   insert: () => '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |' },
  { trigger: 'date',    label: 'Date',             description: "Insert today's date",         icon: '📅',  insert: () => todayDate() },
  { trigger: 'time',    label: 'Time',             description: 'Insert current time',         icon: '🕐',  insert: () => nowTime() },
  { trigger: 'datetime',label: 'Date & Time',      description: 'Insert date and time',        icon: '🗓',  insert: () => `${todayDate()} ${nowTime()}` },
  { trigger: 'note',    label: 'Note callout',     description: 'Info callout block',          icon: '📝',  insert: () => '> [!NOTE]\n> ' },
  { trigger: 'warn',    label: 'Warning callout',  description: 'Warning callout block',       icon: '⚠️',  insert: () => '> [!WARNING]\n> ' },
  { trigger: 'tip',     label: 'Tip callout',      description: 'Tip callout block',           icon: '💡',  insert: () => '> [!TIP]\n> ' },
  { trigger: 'link',    label: 'External link',    description: 'Markdown hyperlink',          icon: '🔗',  insert: () => '[Link text](https://)' },
  { trigger: 'img',     label: 'Image link',       description: 'External image',              icon: '🖼',  insert: () => '![Alt text](https://)' },
  { trigger: 'math',    label: 'Math block',       description: 'LaTeX math block',            icon: '∑',   insert: () => '$$\n\n$$' },
  { trigger: 'diagram', label: 'Mermaid diagram',  description: 'Flowchart or sequence diagram',icon: '📊', insert: () => '```mermaid\ngraph TD\n  A --> B\n```' },
]

export function filterSlashCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS
  const q = query.toLowerCase()
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.trigger.includes(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
  )
}
