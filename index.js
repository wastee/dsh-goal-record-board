/**
 * Goal record board — Host half.
 *
 * The agent calls `goal_record` at the end of a goal round with three fields:
 * problem, solution, result. Every call is already committed as a durable
 * `tool/call` session event by the framework. A session projection folds those
 * events into a plain-JSON list and publishes it as a Client view. Nothing is
 * written to a second store, so the board is reconstructable from the log.
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

const stateSchema = z.object({ records: z.array(recordSchema) })
const viewSchema = z.array(recordSchema)

/**
 * Pure fold: only `goal_record` calls with three non-empty fields become records.
 * The call id deduplicates replay and repeated projection reads.
 */
const projection = {
  key: PROJECTION_KEY,
  stateVersion: 1,
  stateSchema,
  init: () => ({ records: [] }),
  apply(state, event) {
    if (event.type !== 'tool/call' || event.data.name !== TOOL_NAME) return state
    let args
    try {
      args = JSON.parse(event.data.arguments)
    } catch {
      return state
    }
    if (args === null || typeof args !== 'object') return state
    const text = value => typeof value === 'string' ? value.trim() : ''
    const problem = text(args.problem)
    const solution = text(args.solution)
    const result = text(args.result)
    if (problem === '' || solution === '' || result === '') return state
    const id = String(event.data.callId)
    if (state.records.some(record => record.id === id)) return state
    return {
      records: [...state.records, {
        id,
        turn: event.data.turn,
        seq: event.seq,
        time: event.time,
        problem,
        solution,
        result,
      }],
    }
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
