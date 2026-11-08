/**
 * Plain configuration for the OMP Antigravity ACP extension.
 * @module omp-antigravity-acp/config
 */

/** Reasoning effort ids accepted by the Antigravity ACP `thought_level` option. */
export const EFFORTS = ['low', 'medium', 'high'] as const
/** One Antigravity reasoning effort. */
export type Effort = typeof EFFORTS[number]

/** Extension configuration. */
export interface Config {
  /** Provider route id shown in the model picker. */
  provider: string
  /** Display name of the provider group. */
  displayName: string
  /** Absolute path of the `agy` executable; empty resolves `~/.local/bin/agy`, then `agy` on PATH. */
  command: string
  /** Isolated Antigravity home for ACP sessions; empty uses `~/.omp/cache/antigravity-acp`. */
  home: string
  /** Declared context window in tokens; 0 selects 1,048,576 for an unlocked binary and 256,000 otherwise. */
  contextWindow: number
  /** Effort applied when a request carries none. */
  defaultEffort: Effort
  /** Check the binary with the local context-unlock script before starting ACP, and apply it when needed. */
  autoPatch: boolean
  /** Context-unlock script; empty uses `~/.gemini/antigravity/tools/agy-patch.py`. */
  patchScript: string
  /** Maximum concurrent ACP sessions kept alive across conversations, subagents, and auxiliary calls. */
  maxLiveSessions: number
  /** Idle time after which an inactive ACP session is closed. */
  idleSessionTtlMs: number
  /** Window that groups parallel tool calls into one OMP step. */
  parkSettleMs: number
  /** SSE keepalive interval for parked tool calls. */
  keepAliveMs: number
  /** Delay in ms before a parked tool call returns a still-running relay notice to refresh cache TTL before agy's 180s MCP deadline. */
  relayAfterMs: number
  /** Automatic continuations after an output-length stop (long decode). */
  longDecodeContinuations: number
  /** Start the ACP process and read the model catalog at plugin load. */
  warmup: boolean
  /** Minimum interval between quota refreshes through `agy -p /usage`. */
  quotaTtlMs: number
}

/** Defaults applied by the extension before constructing the runtime. */
export const DEFAULT_CONFIG: Config = {
  provider: 'antigravity',
  displayName: 'Antigravity',
  command: '',
  home: '',
  contextWindow: 0,
  defaultEffort: 'high',
  autoPatch: false,
  patchScript: '',
  maxLiveSessions: 16,
  idleSessionTtlMs: 30 * 60_000,
  parkSettleMs: 250,
  keepAliveMs: 15_000,
  relayAfterMs: 85_000,
  longDecodeContinuations: 3,
  warmup: true,
  quotaTtlMs: 120_000,
}

/**
 * Narrow an arbitrary effort id to an Antigravity effort.
 * @param value - requested effort id.
 * @returns the effort, or undefined when Antigravity does not offer it.
 */
export function asEffort(value: string | undefined): Effort | undefined {
  return (EFFORTS as readonly string[]).includes(value ?? '') ? value as Effort : undefined
}
