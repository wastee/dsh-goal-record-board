import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projection } from '../index.js'

// 事件信封：{ type, seq, time, data }
// 助手消息：data.turn 是本轮轮次，data.message.content 是内容片段数组。
function assistantMessage({ turn, content, seq = 1, time = 1000 }) {
  return {
    type: 'assistant/message',
    seq,
    time,
    data: {
      turn,
      step: 1,
      message: {
        role: 'assistant',
        content,
      },
    },
  }
}

function textContent(...parts) {
  return parts.map(text => ({ type: 'text', text }))
}

test('投影 stateVersion 为 3', () => {
  assert.equal(projection.stateVersion, 3)
})

test('一条助手文字消息折出一条记录，字段正确', () => {
  let state = projection.apply(projection.init(), assistantMessage({
    turn: 5,
    content: textContent('成果原文'),
    seq: 11,
    time: 2222,
  }))
  assert.equal(state.records.length, 1)
  assert.deepEqual(state.records[0], {
    id: 'turn:5',
    turn: 5,
    seq: 11,
    time: 2222,
    text: '成果原文',
  })
})

test('同一轮后续助手消息覆盖前一条，只保留一条记录', () => {
  let state = projection.apply(projection.init(), assistantMessage({
    turn: 5,
    content: textContent('中间回答'),
    seq: 11,
    time: 2222,
  }))
  state = projection.apply(state, assistantMessage({
    turn: 5,
    content: textContent('最终回答'),
    seq: 19,
    time: 3333,
  }))
  assert.equal(state.records.length, 1)
  assert.equal(state.records[0].text, '最终回答')
  assert.equal(state.records[0].seq, 19)
  assert.equal(state.records[0].time, 3333)
})

test('推理和工具调用片段不产生记录', () => {
  const state = projection.apply(projection.init(), assistantMessage({
    turn: 2,
    content: [
      { type: 'reasoning', text: '只思考' },
      { type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' },
    ],
  }))
  assert.equal(state.records.length, 0)
})

test('空文字不产生记录，缺轮次也不产生记录', () => {
  let state = projection.apply(projection.init(), assistantMessage({
    turn: 1,
    content: textContent('   '),
  }))
  assert.equal(state.records.length, 0)

  state = projection.apply(projection.init(), {
    type: 'assistant/message',
    seq: 1,
    time: 1000,
    data: { message: { role: 'assistant', content: textContent('回答') } },
  })
  assert.equal(state.records.length, 0)
})

test('多个文字片段用空行连接', () => {
  const state = projection.apply(projection.init(), assistantMessage({
    turn: 3,
    content: [
      { type: 'text', text: '第一段' },
      { type: 'reasoning', text: '忽略' },
      { type: 'text', text: '第二段' },
    ],
  }))
  assert.equal(state.records[0].text, '第一段\n\n第二段')
})

test('content 为字符串时直接作为文字', () => {
  const state = projection.apply(projection.init(), assistantMessage({
    turn: 4,
    content: ' 纯文本回答 ',
  }))
  assert.equal(state.records.length, 1)
  assert.equal(state.records[0].text, '纯文本回答')
})

test('多轮按首次出现顺序保留，每轮一条', () => {
  let state = projection.init()
  state = projection.apply(state, assistantMessage({ turn: 1, content: textContent('A1') }))
  state = projection.apply(state, assistantMessage({ turn: 2, content: textContent('B1') }))
  state = projection.apply(state, assistantMessage({ turn: 1, content: textContent('A2') }))
  assert.equal(state.records.length, 2)
  assert.deepEqual(state.records.map(record => [record.turn, record.text]), [[1, 'A2'], [2, 'B1']])
})

test('重复的同一事件返回原状态', () => {
  const event = assistantMessage({ turn: 6, content: textContent('回答'), seq: 8, time: 9 })
  const state = projection.apply(projection.init(), event)
  assert.equal(projection.apply(state, event), state)
})

test('旧的 goal_record 工具调用不再产生记录', () => {
  const state = projection.apply(projection.init(), {
    type: 'tool/call',
    seq: 1,
    time: 1000,
    data: {
      name: 'goal_record',
      callId: 'call-old',
      turn: 1,
      arguments: JSON.stringify({ problem: '问题', solution: '方案', result: '成果' }),
    },
  })
  assert.equal(state.records.length, 0)
})

test('视图直接暴露记录数组', () => {
  const state = projection.apply(projection.init(), assistantMessage({
    turn: 1,
    content: textContent('回答'),
  }))
  assert.equal(projection.key, 'goalRecordBoard')
  assert.equal(projection.wire.view(state), state.records)
})
