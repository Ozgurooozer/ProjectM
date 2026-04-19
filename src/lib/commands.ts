export interface Command {
  id: string
  name: string
  category: string
  shortcut?: string
  action: () => void | Promise<void>
  enabled?: () => boolean
}

class CommandRegistry {
  private commands: Map<string, Command> = new Map()

  register(command: Command) {
    this.commands.set(command.id, command)
  }

  unregister(id: string) {
    this.commands.delete(id)
  }

  getAll(): Command[] {
    return Array.from(this.commands.values())
  }

  get(id: string): Command | undefined {
    return this.commands.get(id)
  }

  run(id: string) {
    const cmd = this.commands.get(id)
    if (cmd && (cmd.enabled?.() ?? true)) {
      cmd.action()
    }
  }
}

export const commandRegistry = new CommandRegistry()
