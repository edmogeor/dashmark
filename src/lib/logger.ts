type LogLevel = 'info' | 'warn' | 'error'

type LogScope = 'docker' | 'config' | 'icons' | 'selfhst'

type LogContext = Record<string, unknown>

function write(level: LogLevel, scope: LogScope, msg: string, context?: LogContext): void {
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    scope,
    msg,
    ...context
  }

  for (const key of Object.keys(entry)) {
    const value = entry[key]
    if (value instanceof Error) {
      entry[key] = value.message
    }
  }

  const line = JSON.stringify(entry)
  if (level === 'info') {
    process.stdout.write(line + '\n')
  } else {
    process.stderr.write(line + '\n')
  }
}

export const logger = {
  info(scope: LogScope, msg: string, context?: LogContext): void {
    write('info', scope, msg, context)
  },
  warn(scope: LogScope, msg: string, context?: LogContext): void {
    write('warn', scope, msg, context)
  },
  error(scope: LogScope, msg: string, context?: LogContext): void {
    write('error', scope, msg, context)
  }
}
