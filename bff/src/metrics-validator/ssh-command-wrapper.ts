type SshCommandExecutor<T> = (command: string) => Promise<T>

const DEFAULT_READ_ONLY_SSH_COMMAND_ALLOWLIST = Object.freeze([
  'cat',
  'date',
  'find',
  'grep',
  'head',
  'hostname',
  'ls',
  'ps',
  'sed',
  'stat',
  'tail',
  'uptime'
])

const BLOCKED_SHELL_CONTROL_PATTERN = /[;&|<>`]|(?:\$\()|[\r\n]/

function normalizeCommandToken(token: string): string {
  const trimmed = token.trim()
  const pathSplit = trimmed.split('/')
  return (pathSplit[pathSplit.length - 1] ?? '').toLowerCase()
}

function extractPrimaryCommandToken(command: string): string {
  const trimmed = command.trim()
  if (trimmed.length === 0) {
    throw new Error('SSH command cannot be empty')
  }

  const primaryToken = trimmed.split(/\s+/)[0]
  return normalizeCommandToken(primaryToken)
}

function assertReadOnlyAllowlistedSshCommand(
  command: string,
  allowlist: ReadonlyArray<string> = DEFAULT_READ_ONLY_SSH_COMMAND_ALLOWLIST
): string {
  if (BLOCKED_SHELL_CONTROL_PATTERN.test(command)) {
    throw new Error(
      'SSH command contains blocked shell control operators; only single read-only commands are allowed'
    )
  }

  const primaryCommandToken = extractPrimaryCommandToken(command)
  const normalizedAllowlist = new Set(
    allowlist.map((allowlistedCommand) => allowlistedCommand.toLowerCase())
  )

  if (!normalizedAllowlist.has(primaryCommandToken)) {
    throw new Error(
      `SSH command "${primaryCommandToken}" is not allowlisted for read-only execution`
    )
  }

  return command.trim()
}

function createReadOnlySshCommandWrapper<T>(
  executeCommand: SshCommandExecutor<T>,
  allowlist: ReadonlyArray<string> = DEFAULT_READ_ONLY_SSH_COMMAND_ALLOWLIST
): SshCommandExecutor<T> {
  return async (command: string): Promise<T> => {
    const normalizedCommand = assertReadOnlyAllowlistedSshCommand(
      command,
      allowlist
    )

    return executeCommand(normalizedCommand)
  }
}

export {
  assertReadOnlyAllowlistedSshCommand,
  createReadOnlySshCommandWrapper,
  DEFAULT_READ_ONLY_SSH_COMMAND_ALLOWLIST,
  type SshCommandExecutor
}
