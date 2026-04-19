import React from 'react'
import { eventBus } from './events'
import { useAppStore } from '../store/appStore'
import { readNote } from './tauri'
import type { FileNode } from '../types'

// ---- Extension point types ----

export interface SidebarPanelRegistration {
  id: string
  label: string
  icon: string
  render: () => React.ReactNode
}

export interface ContextMenuItemRegistration {
  id: string
  label: string
  showFor: 'file' | 'folder' | 'both'
  onClick: (nodePath: string) => void
}

export interface CommandRegistration {
  id: string
  label: string
  keybinding?: string
  execute: () => void
}

// ---- Plugin context ----

export interface PluginContext {
  getVaultPath: () => string | null
  getActiveNotePath: () => string | null
  getNoteContent: () => string
  getFileTree: () => FileNode[]
  events: typeof eventBus
  openNote: (path: string) => Promise<void>
  setNoteContent: (content: string) => void
  registerSidebarPanel: (panel: SidebarPanelRegistration) => void
  registerContextMenuItem: (item: ContextMenuItemRegistration) => void
  registerCommand: (command: CommandRegistration) => void
  log: (msg: string) => void
}

// ---- Plugin interface ----

export interface Plugin {
  id: string
  name: string
  version: string
  description?: string
  activate: (ctx: PluginContext) => void | Promise<void>
  deactivate?: (ctx: PluginContext) => void | Promise<void>
}

// ---- Registry ----

class PluginRegistry {
  private plugins = new Map<string, Plugin>()
  private activeContexts = new Map<string, PluginContext>()

  readonly sidebarPanels: SidebarPanelRegistration[] = []
  readonly contextMenuItems: ContextMenuItemRegistration[] = []
  readonly commands: CommandRegistration[] = []

  private buildContext(pluginId: string): PluginContext {
    return {
      getVaultPath: () => useAppStore.getState().vaultPath,
      getActiveNotePath: () => useAppStore.getState().activeNotePath,
      getNoteContent: () => useAppStore.getState().noteContent,
      getFileTree: () => useAppStore.getState().fileTree,
      events: eventBus,
      openNote: async (path) => {
        const content = await readNote(path)
        useAppStore.getState().setActiveNote(path, content)
      },
      setNoteContent: (content) => useAppStore.getState().setNoteContent(content),
      registerSidebarPanel: (panel) => this.sidebarPanels.push(panel),
      registerContextMenuItem: (item) => this.contextMenuItems.push(item),
      registerCommand: (cmd) => this.commands.push(cmd),
      log: (msg) => console.log(`[Plugin:${pluginId}] ${msg}`),
    }
  }

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin ${plugin.id} is already registered`)
      return
    }
    this.plugins.set(plugin.id, plugin)
  }

  async activate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`)
    const ctx = this.buildContext(pluginId)
    this.activeContexts.set(pluginId, ctx)
    await plugin.activate(ctx)
    eventBus.emit('plugin:activated', { pluginId })
  }

  async deactivate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    const ctx = this.activeContexts.get(pluginId)
    if (!plugin || !ctx) return
    await plugin.deactivate?.(ctx)
    this.activeContexts.delete(pluginId)
    eventBus.emit('plugin:deactivated', { pluginId })
  }

  isActive(pluginId: string): boolean {
    return this.activeContexts.has(pluginId)
  }

  getActivePluginIds(): string[] {
    return Array.from(this.activeContexts.keys())
  }
}

export const pluginRegistry = new PluginRegistry()
