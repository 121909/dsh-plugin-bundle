import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DEFAULT_CONFIG, EFFORTS, type Config } from './config.ts'

/** Same bounds as the runtime configuration; malformed input must not silently alter tool deadlines. */
const NUMBER_BOUNDS: Record<string, readonly [number, number]> = {
  contextWindow: [0, Number.MAX_SAFE_INTEGER], maxLiveSessions: [1, 64],
  idleSessionTtlMs: [10_000, Number.MAX_SAFE_INTEGER], parkSettleMs: [0, 5_000],
  keepAliveMs: [1_000, Number.MAX_SAFE_INTEGER], relayAfterMs: [5_000, 165_000],
  longDecodeContinuations: [0, 16], quotaTtlMs: [5_000, Number.MAX_SAFE_INTEGER],
}

export function loadConfig(agentDir: string): Config {
  const path = process.env.OMP_ANTIGRAVITY_CONFIG ?? join(agentDir, 'antigravity-acp.json')
  const config: Config = { ...DEFAULT_CONFIG, home: join(agentDir, 'cache', 'antigravity-acp') }
  if (!existsSync(path)) {
    if (process.env.OMP_ANTIGRAVITY_CONFIG !== undefined) throw new Error(`Antigravity config not found: ${path}`)
    return config
  }
  const input: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error(`Antigravity config must be an object: ${path}`)
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(DEFAULT_CONFIG, key)) throw new Error(`Unknown Antigravity setting: ${key}`)
    const bounds = NUMBER_BOUNDS[key]
    if (bounds !== undefined) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < bounds[0] || value > bounds[1]) {
        throw new Error(`Antigravity ${key} must be an integer in ${bounds[0]}..${bounds[1]}`)
      }
    } else if (typeof value !== typeof DEFAULT_CONFIG[key as keyof Config]) {
      throw new Error(`Antigravity ${key} must be ${typeof DEFAULT_CONFIG[key as keyof Config]}`)
    }
    if (key === 'defaultEffort' && !EFFORTS.includes(value as Config['defaultEffort'])) throw new Error('Antigravity defaultEffort must be low, medium, or high')
    Object.assign(config, { [key]: value })
  }
  if (config.home.length > 0) config.home = resolve(config.home)
  return config
}
