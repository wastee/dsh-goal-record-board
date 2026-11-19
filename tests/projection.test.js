import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projection } from '../index.js'

// 事件信封：{ type, seq, time, data }
// 顶层工具调用：data.arguments 是 JSON 字符串
function topCall({ name, callId, turn, args, seq = 1, time = 1000 }) {
  return {
    type: 'tool/call',
    seq,
    time,
    data: { name, callId, turn, arguments: JSON.stringify(args) },
  }
}

// PTC 子调用：data.arguments 已是对象，用 rootCallId 关联顶层调用
function ptcDispatch({ subCallId, rootCallId, args, seq = 2, time = 1001, name = 'goal_record' }) {
  return {
    type: 'tool/ptc-dispatch',
    seq,
    time,
    data: { name, subCallId, rootCallId, arguments: args },
  }
}

const threeFields = {
  problem: '问题原文',
  solution: '方案原文',
  result: '成果原文',
}

test('投影 stateVersion 为 2', () => {
  assert.equal(projection.stateVersion, 2)
})

test('顶层 goal_record 调用折出一条记录，字段正确且 turn 取自 data.turn', () => {
  let state = projection.init()
  const event = topCall({
    name: 'goal_record',
    callId: 'call-top-1',
    turn: 5,
    args: threeFields,
    seq: 11,
    time: 2222,
  })
  state = projection.apply(state, event)
  const records = state.records
  assert.equal(records.length, 1)
  assert.deepEqual(records[0], {
    id: 'call-top-1',
    turn: 5,
    seq: 11,
    time: 2222,
    ...threeFields,
  })
})

test('PTC 子调用折出一条记录，turn 从 rootCallId 对应的顶层调用取得', () => {
  let state = projection.init()
  state = projection.apply(state, topCall({
    name: 'run_code',
    callId: 'root-1',
    turn: 7,
    args: { code: 'console.log(1)' },
    seq: 1,
    time: 1000,
  }))
  assert.equal(state.records.length, 0, '顶层 run_code 不产生记录')
  state = projection.apply(state, ptcDispatch({
    subCallId: 'root-1:ptc:1',
    rootCallId: 'root-1',
    args: threeFields,
    seq: 2,
    time: 1001,
  }))
  const records = state.records
  assert.equal(records.length, 1)
  assert.equal(records[0].id, 'root-1:ptc:1')
  assert.equal(records[0].turn, 7, 'turn 来自 rootCallId 对应的顶层调用')
  assert.equal(records[0].seq, 2)
  assert.equal(records[0].time, 1001)
  assert.equal(records[0].problem, threeFields.problem)
  assert.equal(records[0].solution, threeFields.solution)
  assert.equal(records[0].result, threeFields.result)
})

test('problem、solution、result 任一为空字符串时不记录', () => {
  for (const field of ['problem', 'solution', 'result']) {
    const args = { ...threeFields, [field]: '' }
    const state = projection.apply(projection.init(), topCall({
      name: 'goal_record',
      callId: 'empty-' + field,
      turn: 3,
      args,
    }))
    assert.equal(state.records.length, 0, field + ' 为空时不应记录')
  }
})

test('同一 id 重复出现只记一条（去重）', () => {
  const event = topCall({
    name: 'goal_record',
    callId: 'dup-call',
    turn: 4,
    args: threeFields,
  })
  let state = projection.apply(projection.init(), event)
  state = projection.apply(state, event)
  assert.equal(state.records.length, 1)

  // PTC 路径同样按 subCallId 去重
  let ptcState = projection.init()
  ptcState = projection.apply(ptcState, topCall({
    name: 'run_code',
    callId: 'root-dup',
    turn: 9,
    args: { code: 'x' },
  }))
  const ptcEvent = ptcDispatch({
    subCallId: 'root-dup:ptc:1',
    rootCallId: 'root-dup',
    args: threeFields,
  })
  ptcState = projection.apply(ptcState, ptcEvent)
  ptcState = projection.apply(ptcState, ptcEvent)
  assert.equal(ptcState.records.length, 1)
})
