/**
 * Goal record board — Host half.
 *
 * Each board record is one round's final assistant answer. The framework
 * commits every assistant message as an `assistant/message` session event; the
 * projection keeps the last text message of each turn and publishes the list
 * to the Client. Nothing is written to a second store, and the board does not
 * call a model or ask the agent for a separate report.
 */
import { z } from 'zod'

/** Projection key consumed by the Client through `useProjection('goalRecordBoard')`. */
const PROJECTION_KEY = 'goalRecordBoard'

/** One board record, stored in plain JSON and sent to the Client as-is. */
const recordSchema = z.object({
  id: z.string(),
  turn: z.number(),
  seq: z.number(),
  time: z.number(),
  text: z.string(),
})

const stateSchema = z.object({ records: z.array(recordSchema) })
const viewSchema = z.array(recordSchema)

/** Join the text parts of one assistant message; reasoning and tool calls are skipped. */
function assistantText(message) {
  if (message === null || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const part of content) {
    if (part === null || typeof part !== 'object') continue
    if (part.type !== 'text' || typeof part.text !== 'string') continue
    const text = part.text.trim()
    if (text !== '') parts.push(text)
  }
  return parts.join('\n\n')
}

/**
 * One record per turn. The first assistant text creates the record and a later
 * assistant message in the same turn replaces it, so the final answer wins
 * without adding another row for the same round.
 */
function recordAnswer(state, event) {
  const turn = event.data?.turn
  if (typeof turn !== 'number') return state
  const text = assistantText(event.data?.message)
  if (text === '') return state
  const id = 'turn:' + turn
  const record = { id, turn, seq: event.seq, time: event.time, text }
  const index = state.records.findIndex(item => item.id === id)
  if (index === -1) return { ...state, records: [...state.records, record] }
  const current = state.records[index]
  if (current.text === text && current.seq === event.seq && current.time === event.time) return state
  const records = state.records.slice()
  records[index] = record
  return { ...state, records }
}

export const projection = {
  key: PROJECTION_KEY,
  stateVersion: 3,
  stateSchema,
  init: () => ({ records: [] }),
  apply(state, event) {
    if (event.type === 'assistant/message') return recordAnswer(state, event)
    return state
  },
  wire: { viewSchema, view: state => state.records },
}

export const inject = ['sessionProjections']

export function apply(ctx) {
  ctx.effect(() => {
    let handle
    let disposed = false
    void ctx.sessionProjections.register(projection).then((ready) => {
      if (disposed) void ready.dispose()
      else handle = ready
    })
    return () => {
      disposed = true
      if (handle !== undefined) void handle.dispose()
    }
  }, 'goal-record-board: projection')
}
