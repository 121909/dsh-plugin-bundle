import { createHash } from 'node:crypto'
import type { Message } from '@oh-my-pi/pi-ai'
import type { ContentBlock, RequestMessage } from './protocol.ts'

type OmpBlock = Exclude<Message['content'], string>[number]

function blocks(content: Message['content']): ContentBlock[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return content.flatMap((block: OmpBlock, index): ContentBlock[] => {
    switch (block.type) {
      case 'text': return [{ type: 'text', text: block.text }]
      case 'thinking': return [{ type: 'reasoning', text: block.thinking }]
      case 'redactedThinking': return []
      case 'toolCall': return [{ type: 'tool-call', id: block.id, name: block.name, arguments: JSON.stringify(block.arguments) }]
      case 'image': return [{ type: 'image', attachment: { attachmentId: `image-${index}`, data: block.data, mimeType: block.mimeType } }]
      default: return [{ type: 'text', text: JSON.stringify(block) }]
    }
  })
}

/** Content-addressed ids detect in-place pruning as well as branch/compaction rewrites. */
function requestMessage(message: Message): RequestMessage {
  const content = blocks(message.content)
  let projected: RequestMessage
  switch (message.role) {
    case 'assistant':
      projected = { role: 'assistant', content, source: { kind: 'model', provider: message.provider, model: message.model } }
      break
    case 'toolResult':
      projected = { role: 'tool', content, toolCallId: message.toolCallId, isError: message.isError }
      break
    default:
      projected = { role: message.role, content }
  }
  projected.id = createHash('sha256').update(JSON.stringify(projected)).digest('hex')
  return projected
}

export function toMessages(messages: readonly Message[]): RequestMessage[] {
  return messages.map(requestMessage)
}
