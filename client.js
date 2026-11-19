/**
 * Goal record board — Client half.
 *
 * Entry: a checklist button in the session header's action area opens a
 * right-sidebar tab.
 * The tab body reads `useProjection('goalRecordBoard')`, the per-session list
 * published by the Host projection. Each row is collapsed by default; clicking
 * it expands a drawer with exactly three fields.
 */
window.__ModuleLoader__.load({
  id: '@wastee/dsh-goal-record-board',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const TAB_ID = '@wastee/dsh-goal-record-board'
    const TAB_KIND = 'goal-record-board'
    const NS = 'goalRecordBoard'

    const zh = {
      menu: '目标记录看板',
      title: '目标记录看板',
      empty: '还没有记录',
      emptyHint: '目标每轮结束后，遇到的问题、采用的方案和取得的成果会记录在这里。',
      round: '第 {n} 轮',
      roundNote: '来自第 {n} 轮',
      problem: '什么问题',
      solution: '什么方案',
      result: '什么成果',
      guide: '每轮的什么问题、什么方案、什么成果',
    }
    const en = {
      menu: 'Goal Record Board',
      title: 'Goal Record Board',
      empty: 'No records yet',
      emptyHint: 'When a goal finishes each round, the problem, solution and result it produced are recorded here.',
      round: 'Round {n}',
      roundNote: 'From round {n}',
      problem: 'Problem',
      solution: 'Solution',
      result: 'Result',
      guide: 'Problem, solution and result for each round',
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

    /** Format an event timestamp as MM-DD HH:mm:ss in the browser's local zone. */
    function formatTime(ms) {
      if (typeof ms !== 'number' || !isFinite(ms)) return ''
      const d = new Date(ms)
      const pad = value => String(value).padStart(2, '0')
      return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' '
        + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    }

    function Field(props) {
      const { label, text } = props
      return h('div', { className: 'grb-field' },
        h('div', { className: 'grb-field-label' }, label),
        h('div', { className: 'grb-field-text' }, text),
      )
    }

    function Row(props) {
      const { record, t, index } = props
      const [open, setOpen] = React.useState(false)
      const timeText = formatTime(record.time)
      return h('div', { className: 'grb-row' + (open ? ' grb-row-open' : '') },
        h('button', {
          type: 'button',
          className: 'grb-row-head',
          'aria-expanded': open,
          onClick: () => setOpen(value => !value),
        },
          h('span', { className: 'grb-row-index' }, String(index + 1)),
          h('span', { className: 'grb-row-heading' }, timeText),
          h('span', { className: 'grb-row-chevron', 'aria-hidden': 'true' }, open ? '\u2212' : '+'),
        ),
        open ? h('div', { className: 'grb-drawer' },
          h('div', { className: 'grb-row-ref' }, String(t('roundNote')).replace('{n}', String(record.turn))),
          h(Field, { label: t('problem'), text: record.problem }),
          h(Field, { label: t('solution'), text: record.solution }),
          h(Field, { label: t('result'), text: record.result }),
        ) : null,
      )
    }

    function EmptyState(props) {
      const t = props.t
      const icon = h('svg', {
        className: 'grb-empty-icon', width: 40, height: 40, viewBox: '0 0 24 24',
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
      const records = props.useProjection('goalRecordBoard') ?? []
      return h('div', { className: 'grb-root' },
        records.length === 0
          ? h(EmptyState, { t })
          : h('div', { className: 'grb-list' }, records.map((record, index) =>
              h(Row, { key: record.id, record, t, index }))),
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

      // Styles: inherit the host theme through --dsw-alias-* tokens. The font
      // stack uses system fonts only; no font files are bundled or loaded.
      ctx.effect(() => {
        const tagId = TAB_ID + '/board'
        let tag = document.querySelector('style[data-plugin-css="' + tagId + '"]')
        if (tag === null) {
          tag = document.createElement('style')
          tag.dataset.plugin = TAB_ID
          tag.dataset.pluginCss = tagId
          tag.textContent = [
            ".grb-root{--grb-font:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Helvetica Neue',Helvetica,Arial,sans-serif;position:relative;min-height:100%;box-sizing:border-box;padding:12px 12px 32px;color:var(--dsw-alias-label-primary);font-family:var(--grb-font);font-size:13px;line-height:1.6;background:var(--dsw-alias-bg-base)}",
            ".grb-list,.grb-empty{position:relative}",
            ".grb-list{display:flex;flex-direction:column}",
            ".grb-row{border-radius:10px}",
            ".grb-row-head{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:10px 8px;border:0;border-radius:10px;background:transparent;color:inherit;font-family:inherit;font-size:13px;font-weight:500;text-align:left;cursor:pointer}",
            "@media (hover:hover){.grb-row-head:hover{background:var(--dsw-alias-bg-layer-2)}}",
            ".grb-row-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
            ".grb-row-index{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:22px;height:22px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:400}",
            ".grb-row-heading{flex:1;min-width:0}",
            ".grb-row-chevron{flex:none;color:var(--dsw-alias-label-tertiary);font-size:15px;line-height:1}",
            ".grb-drawer{margin:0 8px 8px;padding:2px 6px 10px;border-top:.5px solid var(--dsw-alias-border-l2);border-bottom:.5px solid var(--dsw-alias-border-l2);animation:grb-open .16s ease-out}",
            ".grb-row-ref{padding:8px 2px 2px;font-size:11px;color:var(--dsw-alias-label-tertiary)}",
            "@keyframes grb-open{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}",
            ".grb-field{padding:10px 0}",
            ".grb-field + .grb-field{border-top:.5px solid var(--dsw-alias-border-l1)}",
            ".grb-field-label{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.06em}",
            ".grb-field-text{margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px;color:var(--dsw-alias-label-secondary)}",
            ".grb-empty{padding:64px 24px;text-align:center;display:flex;flex-direction:column;align-items:center}",
            ".grb-empty-icon{color:var(--dsw-alias-label-tertiary);margin-bottom:14px}",
            ".grb-empty-title{font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.7}",
            ".grb-empty-hint{max-width:280px;margin-top:6px;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.6}",
            ".grb-header-action{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:3px 6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}",
            ".grb-header-action svg{flex:none;display:block}",
            ".grb-header-action:focus-visible{color:var(--dsw-alias-label-secondary)}",
            "@media (hover:hover){.grb-header-action:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}}",
            ".grb-header-action:active{background:var(--dsw-alias-interactive-bg-active)}",
            "@container (max-width:460px){.grb-header-action-label{display:none}.grb-header-action{box-sizing:border-box;width:28px;height:28px;padding:0;justify-content:center;color:var(--dsw-alias-label-secondary)}}",
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
