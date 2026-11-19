/**
 * Goal record board — Host half.
 *
 * The agent calls `goal_record` at the end of a goal round with three fields:
 * problem, solution, result. Every call is already committed as a durable
 * session event by the framework, either as a direct `tool/call` or, when the
 * model reaches it through `run_code`, as a `tool/ptc-dispatch` sub-event. A
 * session projection folds both shapes into a plain-JSON list and publishes it
 * as a Client view. Nothing is written to a second store, so the board is
 * reconstructable from the log.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'

/** Model-facing tool name. Also the fold discriminator on `tool/call` events. */
const TOOL_NAME = 'goal_record'

/** Projection key consumed by the Client through `useProjection('goalRecordBoard')`. */
const PROJECTION_KEY = 'goalRecordBoard'

/** One board record, stored in plain JSON and sent to the Client as-is. */
const recordSchema = z.object({
  id: z.string(),
  turn: z.number(),
  seq: z.number(),
  time: z.number(),
  problem: z.string(),
  solution: z.string(),
  result: z.string(),
})

/** callTurns maps a top-level tool/call callId to the turn it happened in. */
const stateSchema = z.object({
  records: z.array(recordSchema),
  callTurns: z.record(z.string(), z.number()),
})
const viewSchema = z.array(recordSchema)

/** Only goal_record calls with three non-empty fields become board records. */
function appendRecord(state, event, args, id, turn) {
  if (args === null || typeof args !== 'object') return state
  const text = value => typeof value === 'string' ? value.trim() : ''
  const problem = text(args.problem)
  const solution = text(args.solution)
  const result = text(args.result)
  if (problem === '' || solution === '' || result === '') return state
  if (state.records.some(record => record.id === id)) return state
  return {
    ...state,
    records: [...state.records, {
      id,
      turn,
      seq: event.seq,
      time: event.time,
      problem,
      solution,
      result,
    }],
  }
}

/**
 * Pure fold over two log shapes: a direct `tool/call` and a PTC sub-call
 * (`tool/ptc-dispatch`) emitted when the model reaches goal_record through
 * run_code. The record id deduplicates both; the callId -> turn map supplies
 * the turn that a PTC sub-event does not carry.
 */
export const projection = {
  key: PROJECTION_KEY,
  stateVersion: 2,
  stateSchema,
  init: () => ({ records: [], callTurns: {} }),
  apply(state, event) {
    if (event.type === 'tool/call') {
      // Remember the turn of every top-level call so a later PTC sub-event
      // can recover it through rootCallId.
      const callId = event.data.callId
      const turn = event.data.turn
      const callTurns = state.callTurns ?? {}
      if (callId !== undefined && callId !== null && typeof turn === 'number') {
        state = { ...state, callTurns: { ...callTurns, [String(callId)]: turn } }
      }
      if (event.data.name !== TOOL_NAME) return state
      let args
      try {
        args = JSON.parse(event.data.arguments)
      } catch {
        return state
      }
      return appendRecord(state, event, args, String(callId), typeof turn === 'number' ? turn : 0)
    }

    if (event.type === 'tool/ptc-dispatch') {
      if (event.data.name !== TOOL_NAME) return state
      // A PTC dispatch already carries arguments as an object, no JSON.parse.
      const args = event.data.arguments
      const id = String(event.data.subCallId)
      const rootCallId = String(event.data.rootCallId)
      const turn = (state.callTurns ?? {})[rootCallId] ?? 0
      return appendRecord(state, event, args, id, turn)
    }

    return state
  },
  wire: { viewSchema, view: state => state.records },
}

export const inject = ['tools', 'systemPrompt', 'sessionProjections']

export function apply(ctx) {
  // The projection reads the durable tool log; the tool itself only confirms.
  // register() resolves to a handle whose dispose() releases it. The effect owns
  // that release so the registration follows this plugin's lifetime.
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

  ctx.effect(() => ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: 'Record one goal round in the board: the problem hit, the solution used, and the result achieved. Call once at the end of each round while a goal is active. The board keeps one collapsed row per call for the user to expand.',
    parameters: {
      problem: {
        type: 'string',
        required: true,
        description: 'What problem or obstacle this round ran into.',
      },
      solution: {
        type: 'string',
        required: true,
        description: 'What approach or change was used to handle it.',
      },
      result: {
        type: 'string',
        required: true,
        description: 'What was actually achieved or verified at the end of the round.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { recorded: { type: 'boolean' } },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.recorded === true ? 'Recorded this round in the goal board.' : 'The round was not recorded.',
      }],
    },
    execute: () => Promise.resolve({ recorded: true }),
  })), 'goal-record-board: tool')

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'goal-record-board',
    order: 9050,
    text: 'When a goal is active, call goal_record once at the end of each round. Put the problem met, the solution used, and the result achieved in its three fields. Keep each field to a short, concrete statement; do not repeat the whole answer.',
  }), 'goal-record-board: prompt')
}
