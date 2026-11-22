/**
 * Goal record board — Client half.
 *
 * Entry: a checklist button in the session header's action area opens a
 * right-sidebar tab.
 * The tab body reads the goalRecordBoard projection, the per-session list
 * published by the Host projection. Records are grouped by turn, newest first;
 * each record is one round's final assistant answer. The list shows the first
 * paragraph; clicking a record expands the full answer inside the board. No
 * model call is made for the summary or the expansion.
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
    /** Target round count for the first batch and for each "load more" click. */
    const ROUNDS_PER_PAGE = 10

    const zh = {
      menu: '目标记录看板',
      title: '目标记录看板',
      empty: '还没有记录',
      emptyHint: '每轮结束后，这一轮的最终回答会出现在这里；列表只显示第一段，点开看全文。',
      guide: '每轮最终回答的摘要，点开看全文',
      expand: '展开全文',
      collapse: '收起',
      roundHeader: '第 {n} 轮',
      unknownRound: '轮次未知',
      countLine: '共 {m} 轮',
      countLinePartial: '已显示 {r} / {m} 轮',
      loadMore: '加载更多',
      endOfList: '没有更早的记录了',
    }
    const en = {
      menu: 'Goal Record Board',
      title: 'Goal Record Board',
      empty: 'No records yet',
      emptyHint: 'When each round ends, its final answer appears here. The list shows the first paragraph; click to read the full answer.',
      guide: 'A summary of each round\'s final answer; click to read the full answer',
      expand: 'Show full answer',
      collapse: 'Collapse',
      roundHeader: 'Round {n}',
      unknownRound: 'Unknown round',
      countLine: '{m} rounds total',
      countLinePartial: 'Showing {r} of {m} rounds',
      loadMore: 'Load more',
      endOfList: 'No earlier records',
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

    /**
     * Whole groups from index `start` onward, up to `count` groups. A turn is
     * never split across batches; running out of groups returns what is left.
     */
    function takeBatch(groups, start, count) {
      const batch = []
      for (let index = start; index < groups.length && batch.length < count; index += 1) {
        batch.push(groups[index])
      }
      return batch
    }

    /**
     * Newest-first groups up to and including the group that holds `pivotId`;
     * null when that record is gone and the caller must fall back to the first
     * batch.
     */
    function groupsThroughPivot(groups, pivotId) {
      if (typeof pivotId !== 'string') return null
      for (let index = 0; index < groups.length; index += 1) {
        if (groups[index].records.some(record => record.id === pivotId)) {
          return groups.slice(0, index + 1)
        }
      }
      return null
    }

    /** Id of the oldest record in a newest-first batch: the shown boundary. */
    function lastRecordId(groups) {
      const group = groups[groups.length - 1]
      if (group === undefined) return null
      return group.records[group.records.length - 1].id
    }

    /**
     * The summary is the first paragraph: text up to the first blank line.
     * A final answer without a blank line stays one paragraph and needs no
     * expansion control.
     */
    function firstParagraph(text) {
      if (typeof text !== 'string') return ''
      const normalized = text.replace(/\r\n/g, '\n').trim()
      if (normalized === '') return ''
      const breakIndex = normalized.search(/\n[ \t]*\n/)
      return breakIndex === -1 ? normalized : normalized.slice(0, breakIndex).trim()
    }

    /** Fill the count-line template with the number of rounds. */
    function countText(t, rounds) {
      return String(t('countLine')).replace('{m}', String(rounds))
    }

    /** Partial count line: shown rounds and total rounds. */
    function partialCountText(t, shownRounds, totalRounds) {
      return String(t('countLinePartial'))
        .replace('{r}', String(shownRounds))
        .replace('{m}', String(totalRounds))
    }

    /** Clock for one report; a record on another day than its group's newest also shows MM-DD. */
    function rowTime(record, groupDay) {
      const clock = formatClock(record.time)
      if (dayKey(record.time) === groupDay) return clock
      const date = formatDate(record.time)
      if (date === '') return clock
      return clock === '' ? date : date + ' ' + clock
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

    /**
     * One round report: the first paragraph is the summary. Clicking the
     * summary, or the expand label, reveals the full final answer in place.
     * When the final answer has only one paragraph there is nothing to expand.
     */
    function Report(props) {
      const { record, t, timeText, isNew, focusId, onFocusHandled } = props
      const rootRef = React.useRef(null)
      const [expanded, setExpanded] = React.useState(false)

      // "Load more" moves focus to the first newly shown report. The parent
      // clears focusId right after, so this runs once and later renders leave
      // focus be.
      React.useEffect(() => {
        if (focusId !== record.id) return
        const root = rootRef.current
        if (root !== null) root.focus()
        onFocusHandled()
      }, [focusId, record.id, onFocusHandled])

      const full = typeof record.text === 'string'
        ? record.text.replace(/\r\n/g, '\n').trim()
        : ''
      const summary = firstParagraph(full)
      const canExpand = full !== summary
      const shown = expanded ? full : summary
      const toggle = () => { if (canExpand) setExpanded(value => !value) }
      const onAnswerKeyDown = event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        toggle()
      }
      const answerProps = canExpand
        ? {
            role: 'button',
            tabIndex: 0,
            className: 'grb-answer-button',
            'aria-expanded': expanded,
            title: t(expanded ? 'collapse' : 'expand'),
            onClick: toggle,
            onKeyDown: onAnswerKeyDown,
          }
        : { className: 'grb-answer-static' }
      return h('div', {
        ref: rootRef,
        tabIndex: -1,
        className: isNew ? 'grb-report grb-report-new' : 'grb-report',
      },
        h('div', { className: 'grb-report-head' },
          h('span', { className: 'grb-time' }, timeText),
          h('div', { className: 'grb-report-body' },
            h('div', answerProps, h('span', { className: 'grb-answer' }, shown)),
            canExpand ? h('button', {
              type: 'button',
              className: 'grb-expand',
              'aria-expanded': expanded,
              onClick: toggle,
            }, expanded ? t('collapse') : t('expand')) : null,
          ),
        ),
      )
    }

    function Group(props) {
      const { group, t, todayKey, freshIds, focusId, onFocusHandled } = props
      const newest = group.records[0]
      const newestDay = dayKey(newest.time)
      const dateText = newestDay === todayKey ? '' : formatDate(newest.time)
      return h('div', { className: 'grb-group' },
        h(GroupHead, { turn: group.turn, dateText, t }),
        group.records.map(record => h(Report, {
          key: record.id,
          record,
          t,
          timeText: rowTime(record, newestDay),
          isNew: freshIds.has(record.id),
          focusId,
          onFocusHandled,
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
      // `pivotId` is the oldest record currently shown; it decides where the
      // visible list ends. `pinned` remembers the first batch once, so records
      // that arrive later only extend the newest end instead of pushing rows
      // the user already read out of view.
      const [pivotId, setPivotId] = React.useState(null)
      const [focusId, setFocusId] = React.useState(null)
      const pinned = React.useRef(null)
      // Stable callback: Report effects depend on it and must not re-run each render.
      const onFocusHandled = React.useCallback(() => { setFocusId(null) }, [])

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

      const groups = groupByTurn(records)
      const firstBatch = takeBatch(groups, 0, ROUNDS_PER_PAGE)

      // Pin the first batch the first time a non-empty projection arrives. Its
      // boundary never moves afterwards, so a live update cannot hide records
      // the user already saw.
      React.useEffect(() => {
        if (pinned.current !== null || records.length === 0) return
        const currentGroups = groupByTurn(records)
        const batch = takeBatch(currentGroups, 0, ROUNDS_PER_PAGE)
        const boundary = lastRecordId(batch)
        if (boundary === null) return
        pinned.current = { complete: batch.length === currentGroups.length }
        setPivotId(boundary)
      }, [records])

      // A replaced projection can lose the pivot; fall back to the first batch
      // instead of failing.
      const shownGroups = groupsThroughPivot(groups, pivotId) ?? firstBatch
      const allShown = shownGroups.length === groups.length
      const initialComplete = pinned.current === null
        ? firstBatch.length === groups.length
        : pinned.current.complete

      // One click appends whole older groups until another page of rounds.
      const loadMore = () => {
        const batch = takeBatch(groups, shownGroups.length, ROUNDS_PER_PAGE)
        const boundary = lastRecordId(batch)
        if (boundary === null) return
        setPivotId(boundary)
        // The first report of a newest-first batch is that group's newest record.
        setFocusId(batch[0].records[0].id)
      }

      const todayKey = dayKey(Date.now())
      return h('div', { className: 'grb-root' },
        h('div', { className: 'grb-scroll' },
          records.length === 0
            ? h(EmptyState, { t })
            : [
                h('div', {
                  key: 'count',
                  className: 'grb-count',
                  role: 'status',
                  'aria-atomic': 'true',
                }, allShown
                  ? countText(t, groups.length)
                  : partialCountText(t, shownGroups.length, groups.length)),
                shownGroups.map(group => h(Group, {
                  // A group only ever gains records at its newest end, so the
                  // oldest record keeps the key stable across updates.
                  key: group.turn + ':' + group.records[group.records.length - 1].id,
                  group,
                  t,
                  todayKey,
                  freshIds,
                  focusId,
                  onFocusHandled,
                })),
                allShown ? null : h('div', { key: 'more', className: 'grb-more' },
                  h('button', {
                    type: 'button',
                    className: 'grb-more-button',
                    onClick: loadMore,
                  }, t('loadMore')),
                ),
                allShown && !initialComplete
                  ? h('div', { key: 'end', className: 'grb-end' }, t('endOfList'))
                  : null,
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
            '.grb-more{display:flex;justify-content:center;padding:8px 8px 4px}',
            '.grb-more-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 10px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer;box-shadow:inset 0 0 0 var(--dsh-hairline-width,.5px) var(--dsh-button-outline-color,var(--dsw-alias-border-l3,var(--dsw-alias-border-l2)))}',
            '@media (hover:hover){.grb-more-button:hover{background:var(--dsw-alias-interactive-bg-hover)}}',
            '.grb-end{padding:8px;text-align:center;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
            '.grb-group-head{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:baseline;padding:12px 8px 6px;background:var(--dsw-alias-bg-base);border-bottom:.5px solid var(--dsw-alias-border-l1)}',
            '.grb-group-title{font-size:12px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
            '.grb-group-date{font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
            '.grb-report{padding:0;border-radius:var(--dsw-radius-sm);scroll-margin-top:40px}',
            '.grb-report:focus-visible{outline:2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:-2px}',
            '.grb-report-head{display:flex;align-items:flex-start;gap:10px;padding:7px 8px 12px}',
            '.grb-report-body{flex:1;min-width:0}',
            '.grb-time{flex:none;font-size:12px;line-height:22px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
            '.grb-answer-button{display:block;box-sizing:border-box;width:100%;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
            '.grb-answer-static{display:block;box-sizing:border-box;width:100%;margin:0;padding:0;cursor:text}',
            '.grb-answer-button:focus-visible{outline:2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:2px;border-radius:var(--dsw-radius-sm)}',
            '@media (hover:hover){.grb-answer-button:hover .grb-answer{color:var(--dsw-alias-label-secondary)}}',
            '.grb-answer{font-size:13px;line-height:22px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}',
            '.grb-expand{display:inline-flex;align-items:center;margin:2px 0 0;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:20px;cursor:pointer}',
            '.grb-expand:focus-visible{outline:2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:2px;border-radius:var(--dsw-radius-sm)}',
            '@media (hover:hover){.grb-expand:hover{color:var(--dsw-alias-label-secondary)}}',
            '@keyframes grb-highlight{from{background:var(--dsw-alias-interactive-bg-active)}to{background:transparent}}',
            '.grb-report-new{animation:grb-highlight 1.4s ease-out}',
            '@media (prefers-reduced-motion:reduce){.grb-report-new{animation:none;background:var(--dsw-alias-interactive-bg-active)}}',
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
