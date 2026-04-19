export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface BacklinkEntry {
  sourcePath: string
  snippet: string
}

export interface SearchResult {
  path: string
  snippet: string
}

export interface AppSettings {
  fontSize: number
  theme: 'dark' | 'light'
}

export interface AppState {
  vaultPath: string | null
  fileTree: FileNode[]
  activeNotePath: string | null
  noteContent: string
}
