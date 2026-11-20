/**
 * Goal record board — Client half.
 *
 * Entry: a checklist button in the session header's action area opens a
 * right-sidebar tab.
 * The tab body reads the goalRecordBoard projection, the per-session list
 * published by the Host projection. Records are grouped by turn, newest first;
 * each row is collapsed to a one-line problem summary and opens a drawer with
 * the full problem, solution and result.
 */
window.__ModuleLoader__.load({
  id: '@wastee/dsh-goal-record-board',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const TAB_ID = '@wastee/dsh-goal-record-board'
    const TAB_KIND = 'goal-record-board'
    const NS = 'goalRecordBoard'
    /** Stable empty list for renders without a projection. */
    const NO_RECORDS = []

    const zh = {
      menu: '目标记录看板',
      title: '目标记录看板',
      empty: '还没有记录',
      emptyHint: '目标每轮结束后，遇到的问题、采用的方案和取得的成果会记录在这里。',
      guide: '每轮的什么问题、什么方案、什么成果',
      problem: '问题',
      solution: '方案',
      result: '成果',
      roundHeader: '第 {n} 轮',
      unknownRound: '轮次未知',
      countLine: '{n} 条记录 · {m} 轮',
    }
    const en = {
      menu: 'Goal Record Board',
      title: 'Goal Record Board',
      empty: 'No records yet',
      emptyHint: 'When a goal finishes each round, the problem, solution and result it produced are recorded here.',
      guide: 'Problem, solution and result for each round',
      problem: 'Problem',
      solution: 'Solution',
      result: 'Result',
      roundHeader: 'Round {n}',
      unknownRound: 'Unknown round',
      countLine: '{n} records · {m} rounds',
    }
    const dicts = { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }

    /** Build a translator that reads the active language at call time. */
    function makeT(locale) {
      if (locale === undefined || typeof locale.bind !== 'function') {
        return key => (zh[key] ?? en[key] ?? key)
      }
      const t = locale.bind(NS)
      return key => {
        const value = t(key)
        return typeof value === 'string' && value !== '' ? value : (zh[key] ?? key)
      }
    }

    function useT(ctx) {
      return makeT(ctx.get('locale'))
    }

    /** Two-digit zero padding for the clock and date parts. */
    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    /** Local-zone day key (year-month-day): equal keys mean the same day. */
    function dayKey(ms) {
      if (typeof ms !== 'number' || !isFinite(ms)) return ''
      const d = new Date(ms)
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    }

    /** HH:mm in the browser's local zone, or an empty string for a non-finite timestamp. */
    function formatClock(ms) {
      if (typeof ms !== 'number' || !isFinite(ms)) return ''
      const d = new Date(ms)
      return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    }

    /** MM-DD in the browser's local zone, or an empty string for a non-finite timestamp. */
    function formatDate(ms) {
      if (typeof ms !== 'number' || !isFinite(ms)) return ''
      const d = new Date(ms)
      return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    }

    /**
     * Group the oldest-first projection into newest-first turn groups: reverse
     * the array, then keep adjacent records with the same turn together, so a
     * group is newest first as well.
     */
    function groupByTurn(records) {
      const groups = []
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index]
        const group = groups[groups.length - 1]
        if (group !== undefined && group.turn === record.turn) {
          group.records.push(record)
        } else {
          groups.push({ turn: record.turn, records: [record] })
        }
      }
      return groups
    }

    /** Collapse text to one line: newlines become spaces and outer blanks go away. */
    function singleLine(text) {
      return typeof text === 'string' ? text.replace(/\s*\n\s*/g, ' ').trim() : ''
    }

    /** Collapsed-row summary: the problem, or the result when the problem is empty. */
    function summarize(record) {
      const problem = singleLine(record.problem)
      return problem !== '' ? problem : singleLine(record.result)
    }

    /** Total records and distinct turns; turn 0 means unknown and is not counted. */
    function countRecords(records) {
      const turns = new Set()
      for (const record of records) {
        if (record.turn !== 0) turns.add(record.turn)
      }
      return { total: records.length, rounds: turns.size }
    }

    /** Fill the count-line template with this projection's two numbers. */
    function countText(t, records) {
      const counts = countRecords(records)
      return String(t('countLine'))
        .replace('{n}', String(counts.total))
        .replace('{m}', String(counts.rounds))
    }

    /** Row clock; a record on another day than its group's newest also shows MM-DD. */
    function rowTime(record, groupDay) {
      const clock = formatClock(record.time)
      if (dayKey(record.time) === groupDay) return clock
      const date = formatDate(record.time)
      if (date === '') return clock
      return clock === '' ? date : date + ' ' + clock
    }

    function Field(props) {
      const { label, text } = props
      return h('div', { className: 'grb-field' },
        h('div', { className: 'grb-field-label' }, label),
        h('div', { className: 'grb-field-text' }, text),
      )
    }

    /** Sticky turn heading; the date appears only when the group is not from today. */
    function GroupHead(props) {
      const { turn, dateText, t } = props
      const title = turn === 0
        ? t('unknownRound')
        : String(t('roundHeader')).replace('{n}', String(turn))
      return h('div', { className: 'grb-group-head' },
        h('span', { className: 'grb-group-title' }, title),
        dateText === '' ? null : h('span', { className: 'grb-group-date' }, dateText),
      )
    }

    function Row(props) {
      const { record, t, timeText, summary, isNew } = props
      const [open, setOpen] = React.useState(false)
      const drawerId = React.useId()
      const headRef = React.useRef(null)

      // Escape collapses an open row, moves focus back to its button, and stops
      // the event so the host page does not also act on it. A collapsed row
      // leaves Escape alone.
      const handleKeyDown = event => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        setOpen(false)
        const head = headRef.current
        if (head !== null) head.focus()
      }

      return h('div', {
        className: isNew ? 'grb-row grb-row-new' : 'grb-row',
        onKeyDown: handleKeyDown,
      },
        h('button', {
          ref: headRef,
          type: 'button',
          className: 'grb-row-head',
          'aria-expanded': open,
          'aria-controls': drawerId,
          onClick: () => { setOpen(value => !value) },
        },
          h('span', { className: 'grb-time' }, timeText),
          h('span', { className: 'grb-summary' }, summary),
          h('svg', {
            className: 'grb-chevron' + (open ? ' grb-chevron-open' : ''),
            width: 14, height: 14, viewBox: '0 0 16 16',
            fill: 'none', stroke: 'currentColor', strokeWidth: 1,
            'aria-hidden': 'true',
          }, h('path', { d: 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6' })),
        ),
        // The drawer stays mounted so aria-controls always points at a real
        // element; hidden keeps it out of layout and the accessibility tree,
        // and removing hidden restarts the opening animation.
        h('div', { className: 'grb-drawer', id: drawerId, hidden: !open },
          h(Field, { label: t('problem'), text: record.problem }),
          h(Field, { label: t('solution'), text: record.solution }),
          h(Field, { label: t('result'), text: record.result }),
        ),
      )
    }

    function Group(props) {
      const { group, t, todayKey, freshIds } = props
      const newest = group.records[0]
      const newestDay = dayKey(newest.time)
      const dateText = newestDay === todayKey ? '' : formatDate(newest.time)
      return h('div', { className: 'grb-group' },
        h(GroupHead, { turn: group.turn, dateText, t }),
        group.records.map(record => h(Row, {
          key: record.id,
          record,
          t,
          timeText: rowTime(record, newestDay),
          summary: summarize(record),
          isNew: freshIds.has(record.id),
        })),
      )
    }

    function EmptyState(props) {
      const t = props.t
      const icon = h('svg', {
        className: 'grb-empty-icon', width: 24, height: 24, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.4,
        'aria-hidden': 'true',
      },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('path', { d: 'M7 9h10M7 13h10M7 17h6' }),
      )
      return h('div', { className: 'grb-empty' },
        icon,
        h('div', { className: 'grb-empty-title' }, t('empty')),
        h('div', { className: 'grb-empty-hint' }, t('emptyHint')),
      )
    }

    function Board(props) {
      const t = props.t
      const projection = props.useProjection('goalRecordBoard')
      const records = Array.isArray(projection) ? projection : NO_RECORDS
      const seenIds = React.useRef(new Set())
      const hasBaseline = React.useRef(false)
      const timers = React.useRef(new Set())
      const [freshIds, setFreshIds] = React.useState(() => new Set())

      // Mark records that appeared after the baseline; the first defined
      // projection (an empty array included) only records the baseline. A
      // projection that is not an array yet, or stops being one, resets that
      // readiness so records already present when it finally arrives are not
      // flashed. Each batch of new ids clears itself 1.4s later, matching the
      // highlight animation (reduced motion holds it steady for that time).
      React.useEffect(() => {
        if (!Array.isArray(projection)) {
          hasBaseline.current = false
          seenIds.current = new Set()
          return
        }
        const ids = new Set(projection.map(record => record.id))
        const fresh = []
        if (hasBaseline.current) {
          for (const id of ids) {
            if (!seenIds.current.has(id)) fresh.push(id)
          }
        }
        hasBaseline.current = true
        seenIds.current = ids
        if (fresh.length === 0) return
        setFreshIds(previous => {
          const next = new Set(previous)
          for (const id of fresh) next.add(id)
          return next
        })
        const timer = setTimeout(() => {
          timers.current.delete(timer)
          setFreshIds(previous => {
            const next = new Set(previous)
            for (const id of fresh) next.delete(id)
            return next
          })
        }, 1400)
        timers.current.add(timer)
      }, [projection])

      React.useEffect(() => () => {
        for (const timer of timers.current) clearTimeout(timer)
        timers.current.clear()
      }, [])

      const todayKey = dayKey(Date.now())
      return h('div', { className: 'grb-root' },
        h('div', { className: 'grb-scroll' },
          records.length === 0
            ? h(EmptyState, { t })
            : [
                h('div', { key: 'count', className: 'grb-count' }, countText(t, records)),
                groupByTurn(records).map(group => h(Group, {
                  // A group only ever gains records at its newest end, so the
                  // oldest record keeps the key stable across updates.
                  key: group.turn + ':' + group.records[group.records.length - 1].id,
                  group,
                  t,
                  todayKey,
                  freshIds,
                })),
              ],
        ),
      )
    }

    /**
     * Checklist glyph copied from the product icon set, drawn as inline paths
     * so the plugin carries no dependency on an official Client package.
     */
    function ChecklistIcon(props) {
      const size = props && props.size ? props.size : 14
      return h('svg', {
        className: 'grb-header-icon', width: size, height: size,
        viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1, 'aria-hidden': 'true',
      },
        h('path', { d: 'M3.75 6.25C4.7165 6.25 5.5 5.4665 5.5 4.5C5.5 3.5335 4.7165 2.75 3.75 2.75C2.7835 2.75 2 3.5335 2 4.5C2 5.4665 2.7835 6.25 3.75 6.25Z' }),
        h('path', { d: 'M7.5 4.5H13.5' }),
        h('path', { d: 'M3.75 13.25C4.7165 13.25 5.5 12.4665 5.5 11.5C5.5 10.5335 4.7165 9.75 3.75 9.75C2.7835 9.75 2 10.5335 2 11.5C2 12.4665 2.7835 13.25 3.75 13.25Z' }),
        h('path', { d: 'M7.5 11.5H13.5' }),
      )
    }

    /**
     * Compact title-bar button, styled after the official header actions
     * (ui-jobs / ui-subagent): icon + label, theme tokens, hover/focus states.
     * The native title keeps hover labels visible even where the header clips
     * overflow, without a portal or an official Client package dependency.
     */
    function HeaderAction(props) {
      const { sessionId, openIn, t, useProjection } = props
      // Only sessions that have run a goal get this entry. `current` is present
      // for active, paused, blocked and complete goals alike.
      const hasGoal = typeof useProjection === 'function'
        ? useProjection('goal', goal => goal != null)
        : true
      if (!hasGoal) return null
      const label = typeof t === 'function' ? t('menu') : zh.menu
      return h('button', {
        type: 'button',
        className: 'grb-header-action',
        'aria-label': label,
        title: label,
        onClick: () => { if (typeof openIn === 'function') openIn(sessionId) },
      }, h(ChecklistIcon, { size: 14 }), h('span', { className: 'grb-header-action-label' }, label))
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      const locale = ctx.get('locale')
      const sidebarRight = ctx.get('sidebarRight')
      const tabs = ctx.get('sidebarRightTabs')

      // Styles: inherit the host theme and font through --dsw-alias-* tokens.
      ctx.effect(() => {
        const tagId = TAB_ID + '/board'
        let tag = document.querySelector('style[data-plugin-css="' + tagId + '"]')
        if (tag === null) {
          tag = document.createElement('style')
          tag.dataset.plugin = TAB_ID
          tag.dataset.pluginCss = tagId
          tag.textContent = [
            '.grb-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
            '.grb-scroll{--dsh-scrollbar-width:9px;--dsh-scrollbar-thumb-border:2px;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:12px 12px 28px}',
            '.grb-count{padding:0 8px;margin-bottom:4px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
            '.grb-group-head{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:baseline;padding:12px 8px 6px;background:var(--dsw-alias-bg-base);border-bottom:.5px solid var(--dsw-alias-border-l1)}',
            '.grb-group-title{font-size:12px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
            '.grb-group-date{font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
            '.grb-row{border-radius:var(--dsw-radius-sm)}',
            '.grb-row-head{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:7px 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font:inherit;font-size:13px;line-height:22px;text-align:left;cursor:pointer}',
            '@media (hover:hover){.grb-row-head:hover{background:var(--dsw-alias-interactive-bg-hover)}}',
            '.grb-row-head:active{background:var(--dsw-alias-interactive-bg-active)}',
            '.grb-row-head:focus-visible{outline:2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:-2px}',
            '.grb-time{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
            '.grb-summary{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-primary)}',
            '.grb-chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
            '.grb-chevron-open{transform:rotate(180deg)}',
            '@keyframes grb-highlight{from{background:var(--dsw-alias-interactive-bg-active)}to{background:transparent}}',
            '.grb-row-new{animation:grb-highlight 1.4s ease-out}',
            '@keyframes grb-open{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}',
            '.grb-drawer{padding:2px 8px 10px;animation:grb-open .16s ease-out}',
            '.grb-drawer[hidden]{display:none}',
            '.grb-field + .grb-field{margin-top:10px}',
            '.grb-field-label{font-size:12px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
            '.grb-field-text{margin-top:2px;font-size:13px;line-height:22px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}',
            '@media (prefers-reduced-motion:reduce){.grb-row-new{animation:none;background:var(--dsw-alias-interactive-bg-active)}}',
            '.grb-empty{display:flex;flex-direction:column;align-items:center;padding:48px 20px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:14px}',
            '.grb-empty-icon{margin-bottom:12px;color:var(--dsw-alias-label-caption)}',
            '.grb-empty-title{margin-bottom:8px;font-size:14px;line-height:1.6;font-weight:400;color:var(--dsw-alias-label-tertiary)}',
            '.grb-empty-hint{max-width:280px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
            '.grb-header-action{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:3px 6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}',
            '.grb-header-action svg{flex:none;display:block}',
            '.grb-header-action:focus-visible{color:var(--dsw-alias-label-secondary)}',
            '@media (hover:hover){.grb-header-action:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}}',
            '.grb-header-action:active{background:var(--dsw-alias-interactive-bg-active)}',
            '@container (max-width:460px){.grb-header-action-label{display:none}.grb-header-action{box-sizing:border-box;width:28px;height:28px;padding:0;justify-content:center;color:var(--dsw-alias-label-secondary)}}',
          ].join('\n')
          document.head.appendChild(tag)
        }
        return () => { tag.remove() }
      }, 'goal-record-board: styles')

      if (locale !== undefined) {
        ctx.effect(() => locale.register(NS, dicts), 'goal-record-board: locale')
      }

      const t = makeT(locale)

      if (tabs !== undefined) {
        ctx.effect(() => tabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          title: () => t('title'),
          guide: [{
            id: 'goal-record-board', order: 500,
            title: () => t('title'),
            description: () => t('guide'),
          }],
        }), 'goal-record-board: tab type')
      }

      if (slots !== undefined) {
        ctx.effect(() => slots.inject('sidebar.right.pane.tab', () => slots.register(
          { name: 'sidebar.right.pane.tab', key: TAB_ID },
          props => h(Board, { t: useT(ctx), useProjection: props.useProjection }),
        )), 'goal-record-board: tab body')
      }

      if (slots !== undefined) {
        ctx.effect(() => slots.inject('conversation.session.header.actions', () => slots.register(
          {
            name: 'conversation.session.header.actions',
            id: 'goal-record-board',
            order: 20,
            locale: NS,
            inject: () => ({ openIn: sessionId => sidebarRight?.openTabIn(sessionId, TAB_KIND) }),
          },
          HeaderAction,
        )), 'goal-record-board: session header action')
      }
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply,
    }
  },
})
