import { createAssistantMessageEventStream, toolWireSchema, type AssistantMessageEventStream, type AssistantMessage, type Context, type Model, type SimpleStreamOptions, type ToolCall } from '@oh-my-pi/pi-ai'
import { toMessages } from './messages.ts'
import type { Effort } from './config.ts'
import { LlmError, type FinishReason, type GenerateOptions } from './protocol.ts'
import type { AntigravityRuntime } from './runtime.ts'

export const ACP_API = 'omp-antigravity-acp'

function toRequest(model: Model, context: Context, options: SimpleStreamOptions | undefined, fallback: Effort): GenerateOptions {
  const level = options?.forceReasoningOff ? 'low' : options?.reasoning
  const reasoningEffort = level === 'minimal' || level === 'low' ? 'low'
    : level === 'medium' ? 'medium' : level === 'high' ? 'high' : level === 'xhigh' || level === 'max' ? 'xhigh' : fallback
  return {
    provider: model.provider, model: model.id, messages: toMessages(context.messages),
    system: context.systemPrompt?.join('\n\n') ?? '', reasoningEffort,
    tools: (options?.toolChoice === 'none' ? [] : context.tools ?? []).map(tool => ({
      name: tool.name, description: tool.description, parameters: toolWireSchema(tool),
      ...(tool.deferLoading !== undefined ? { deferLoading: tool.deferLoading } : {}),
    })),
    ...(options?.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options?.signal !== undefined ? { signal: options.signal } : {}),
  }
}

/** ACP parks tools; OMP consumes toolUse, executes them, then calls us with their results. */
export function streamAcp(runtime: AntigravityRuntime, model: Model, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  const message: AssistantMessage = {
    role: 'assistant', api: model.api, provider: model.provider, model: model.id,
    content: [], timestamp: Date.now(), stopReason: 'stop',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  }
  void (async () => {
    try {
      stream.push({ type: 'start', partial: message })
      let finish: FinishReason | undefined
      for await (const chunk of runtime.stream(toRequest(model, context, options, runtime.defaultEffort()))) {
        switch (chunk.type) {
          case 'block-start':
            if (chunk.blockType === 'text') {
              message.content[chunk.index] = { type: 'text', text: '' }
              stream.push({ type: 'text_start', contentIndex: chunk.index, partial: message })
            } else if (chunk.blockType === 'reasoning') {
              message.content[chunk.index] = { type: 'thinking', thinking: '' }
              stream.push({ type: 'thinking_start', contentIndex: chunk.index, partial: message })
            }
            break
          case 'text-delta': {
            const block = message.content[chunk.index]
            if (block?.type !== 'text') throw new Error('ACP text delta has no open text block')
            block.text += chunk.text
            stream.push({ type: 'text_delta', contentIndex: chunk.index, delta: chunk.text, partial: message })
            break
          }
          case 'reasoning-delta': {
            const block = message.content[chunk.index]
            if (block?.type !== 'thinking') throw new Error('ACP thought delta has no open thinking block')
            block.thinking += chunk.text
            stream.push({ type: 'thinking_delta', contentIndex: chunk.index, delta: chunk.text, partial: message })
            break
          }
          case 'tool-call-delta':
            message.content[chunk.index] = { type: 'toolCall', id: chunk.id, name: chunk.name, arguments: {} }
            stream.push({ type: 'toolcall_start', contentIndex: chunk.index, partial: message })
            stream.push({ type: 'toolcall_delta', contentIndex: chunk.index, delta: chunk.argumentsDelta, partial: message })
            break
          case 'block-end': {
            const block = chunk.block
            if (block.type === 'text') {
              message.content[chunk.index] = { type: 'text', text: block.text }
              stream.push({ type: 'text_end', contentIndex: chunk.index, content: block.text, partial: message })
            } else if (block.type === 'reasoning') {
              message.content[chunk.index] = { type: 'thinking', thinking: block.text }
              stream.push({ type: 'thinking_end', contentIndex: chunk.index, content: block.text, partial: message })
            } else if (block.type === 'tool-call') {
              const call: ToolCall = { type: 'toolCall', id: block.id, name: block.name, arguments: JSON.parse(block.arguments) as Record<string, unknown> }
              message.content[chunk.index] = call
              stream.push({ type: 'toolcall_end', contentIndex: chunk.index, toolCall: call, partial: message })
            }
            break
          }
          case 'usage':
            message.usage.input = chunk.usage.inputTokens
            message.usage.output = chunk.usage.outputTokens
            message.usage.cacheRead = chunk.usage.cacheReadTokens ?? 0
            message.usage.cacheWrite = chunk.usage.cacheWriteTokens ?? 0
            message.usage.totalTokens = chunk.usage.totalTokens
            if (chunk.usage.reasoningTokens !== undefined) message.usage.reasoningTokens = chunk.usage.reasoningTokens
            break
          case 'finish': finish = chunk.reason; break
        }
      }
      if (finish === undefined) throw new Error('Antigravity ACP stream ended without a finish reason')
      if (finish.kind === 'aborted' || finish.kind === 'error') {
        message.stopReason = finish.kind
        message.errorMessage = finish.failure.message
        stream.push({ type: 'error', reason: finish.kind, error: message })
      } else {
        message.stopReason = finish.kind === 'tool-calls' ? 'toolUse' : finish.kind === 'max-tokens' ? 'length' : 'stop'
        stream.push({ type: 'done', reason: message.stopReason, message })
      }
    } catch (error) {
      message.stopReason = options?.signal?.aborted ? 'aborted' : 'error'
      message.errorMessage = error instanceof LlmError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error)
      stream.push({ type: 'error', reason: message.stopReason, error: message })
    } finally {
      stream.end(message)
    }
  })()
  return stream
}
