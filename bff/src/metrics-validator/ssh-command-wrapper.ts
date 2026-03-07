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
const BLOCKED_MUTATING_SSH_VERBS = Object.freeze(['restart', 'reconfigure'])
const MUTATING_CONTROL_COMMANDS = new Set([
  'docker',
  'helm',
  'kubectl',
  'pm2',
  'service',
  'supervisorctl',
  'systemctl'
])

function normalizeCommandToken(token: string): string {
  const trimmed = token.trim()
  const pathSplit = trimmed.split('/')
  return (pathSplit[pathSplit.length - 1] ?? '').toLowerCase()
}

function detectBlockedMutatingSshVerb(command: string): string | null {
  const tokens = command
    .trim()
    .split(/\s+/)
    .map((token) =>
      normalizeCommandToken(token).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    )
    .filter((token) => token.length > 0)

  if (tokens.length === 0) {
    return null
  }

  const blockedVerb = BLOCKED_MUTATING_SSH_VERBS.find((verb) =>
    tokens.includes(verb)
  )
  if (!blockedVerb) {
    return null
  }

  const primaryCommandToken = tokens[0]
  if (
    MUTATING_CONTROL_COMMANDS.has(primaryCommandToken) ||
    primaryCommandToken === blockedVerb
  ) {
    return blockedVerb
  }

  return null
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

  const blockedMutatingVerb = detectBlockedMutatingSshVerb(command)
  if (blockedMutatingVerb) {
    throw new Error(
      `Mutating SSH operation "${blockedMutatingVerb}" is blocked in read-only mode; restart/reconfigure commands are not permitted`
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
