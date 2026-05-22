import { type ChildProcess, spawn } from 'node:child_process'
import { logger } from './logger.js'

export type SpawnOptions = {
  cmd: string
  port: number
  env?: NodeJS.ProcessEnv
  readinessTimeoutMs?: number
}

export type SpawnedUpstream = {
  url: string
  child: ChildProcess
  shutdown: () => Promise<void>
}

export const spawnMcpUpstream = async (opts: SpawnOptions): Promise<SpawnedUpstream> => {
  const [bin, ...args] = parseCommand(opts.cmd)
  if (!bin) throw new Error(`MCP_SPAWN_CMD is empty`)

  const child = spawn(bin, args, {
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  child.on('exit', (code, signal) => {
    logger.warn({ code, signal }, 'spawned MCP child exited')
  })

  const url = `http://127.0.0.1:${opts.port}`
  await waitForUpstream(url, opts.readinessTimeoutMs ?? 30_000)

  return {
    url,
    child,
    shutdown: async () => {
      if (child.exitCode != null) return
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 5_000)
        child.once('exit', () => {
          clearTimeout(t)
          resolve()
        })
      })
    },
  }
}

const parseCommand = (cmd: string): string[] =>
  cmd.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((s) => s.replace(/^"|"$/g, '')) ?? []

const waitForUpstream = async (url: string, timeoutMs: number): Promise<void> => {
  const start = Date.now()
  let lastErr: unknown
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/`, { method: 'HEAD' })
      if (res.status < 500) return
      lastErr = new Error(`status ${res.status}`)
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`upstream at ${url} not ready within ${timeoutMs}ms: ${(lastErr as Error)?.message ?? 'unknown'}`)
}
