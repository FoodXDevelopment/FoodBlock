const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }

function createLogger(name) {
  const threshold = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 2

  function emit(level, msg, data) {
    if (LEVELS[level] > threshold) return
    const entry = { ts: new Date().toISOString(), level, name, msg }
    if (data) entry.data = data
    process.stdout.write(JSON.stringify(entry) + '\n')
  }

  return {
    info: (msg, data) => emit('info', msg, data),
    warn: (msg, data) => emit('warn', msg, data),
    error: (msg, data) => emit('error', msg, data),
    debug: (msg, data) => emit('debug', msg, data),
    child: (childName) => createLogger(`${name}:${childName}`)
  }
}

export default createLogger('Server')
