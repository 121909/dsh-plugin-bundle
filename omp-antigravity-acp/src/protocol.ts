/**
 * Local request and streaming protocol between the OMP extension and ACP runtime.
 * These types describe runtime behavior, not a host SDK compatibility layer.
 * @module omp-antigravity-acp/protocol
 */

/** Stable id of a tool call parked by the runtime. */
export type ToolCallId = string & { readonly __toolCallId: unique symbol }

/** Brand an id without allocating or changing its wire representation. */
export function ToolCallId(value: string): ToolCallId {
  return value as ToolCallId
}

/** Durable attachment reference supplied and resolved by the host. */
export interface AttachmentReference {
  attachmentId: string
  mimeType?: string
  data?: string
  path?: string
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; id: ToolCallId | string; name: string; arguments: string }
  | { type: 'image'; attachment: AttachmentReference; offloaded?: boolean }
  | { type: 'file'; attachment: AttachmentReference }
  | { type: 'tool-addition'; toolName: string }
  | { type: 'tool-removal'; toolName: string }

export type MessageSource =
  | { kind: 'model'; provider: string; model: string }
  | { kind: 'system-prompt' }
  | { kind: 'user' }
  | { kind: 'tool'; callId: string }
  | { kind: 'harness' }

interface MessageBase {
  /** Stable host history id; content rewrites must receive a new id. */
  id?: string
  content: readonly ContentBlock[]
}

export type RequestMessage =
  | (MessageBase & { role: 'system' | 'developer' | 'user'; source?: MessageSource })
  | (MessageBase & { role: 'assistant'; source: MessageSource })
  | (MessageBase & { role: 'tool'; toolCallId: string; isError?: boolean; source?: MessageSource })

/** A host-owned tool; execution and permission decisions stay in OMP. */
export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
  deferLoading?: boolean
}

/** One model step, including authoritative history and any completed tool calls. */
export interface GenerateOptions {
  provider: string
  model: string
  messages: readonly RequestMessage[]
  system?: string
  tools?: readonly ToolSchema[]
  reasoningEffort?: string
  sessionId?: string
  /** Independent auxiliary purpose within the same host session. */
  purpose?: string
  signal?: AbortSignal
}

/** Uncached input, cached input, and output buckets remain disjoint. */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  totalTokens: number
}

export type LlmErrorCode =
  | 'TRANSPORT'
  | 'RATE_LIMIT'
  | 'UNKNOWN_MODEL'
  | 'EMPTY_RESPONSE'
  | 'AUTH'
  | 'QUOTA'
  | 'CONTEXT_WINDOW_EXCEEDED'
  | 'TIMEOUT'
  | 'SERVER'

/** Runtime failure with a stable code and the original failure as its cause. */
export class LlmError extends Error {
  constructor(message: string, readonly code: LlmErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LlmError'
  }
}

export interface StreamFailure {
  message: string
  code: 'ABORTED' | 'REFUSAL' | 'PROVIDER_ERROR'
}

export type FinishReason =
  | { kind: 'stop' | 'tool-calls' | 'max-tokens' }
  | { kind: 'aborted' | 'error'; failure: StreamFailure }

export type StreamChunk =
  | { type: 'block-start'; index: number; blockType: 'text' | 'reasoning' | 'tool-call' }
  | { type: 'text-delta' | 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: ToolCallId | string; name: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason }
