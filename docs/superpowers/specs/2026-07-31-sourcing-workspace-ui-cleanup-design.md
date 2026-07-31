# Sourcing Workspace UI Cleanup

## Context

The sourcing workspace combines a conversational brief, structured criteria, run controls, live research progress, a lead queue, and an evidence viewer. The current layout gives every element permanent vertical space inside the assistant column. That works in the initial empty state at wide desktop sizes, but it fails when messages accumulate, the research progress drawer opens, or the workspace crosses the two-column and mobile breakpoints.

The reported symptoms are:

- new assistant replies can be rendered below the visible portion of the transcript;
- the criteria and scoring cards visually block the conversation;
- starting a run opens a large progress drawer that shrinks the assistant and allows its composer to spill over the progress UI;
- narrow layouts retain the same content density, producing a very short chat viewport and an unnecessarily long first column.

Browser measurements confirmed the structural cause. At 390px wide, the transcript is only 110px high while criteria, scoring, composer, actions, and status consume more than 500px beneath it. During an active run, the open progress drawer competes for the same constrained column height.

## Goals

- Keep the latest conversation visible as messages arrive.
- Preserve chat as the dominant control surface.
- Keep criteria and scoring inspectable without occupying permanent space.
- Prevent any assistant, composer, or progress content from overlapping at supported widths.
- Give running, cancelled, exhausted, failed, partial, and completed runs distinct, recoverable presentations.
- Preserve the existing Aurum visual identity, product logic, and accessible native controls.

## Non-goals

- Rebranding or replacing the incumbent visual system.
- Changing research, scoring, persistence, or export behavior.
- Adding new marketplace data sources or changing sourcing strategy.
- Redesigning lead evidence content beyond layout changes required for run states.

## Approaches considered

### 1. Structural state cleanup — selected

Give the assistant a stable shell, collapse secondary criteria, automatically follow new messages, and move detailed run progress into the lead workspace where there is room for it.

This addresses the root cause and gives each state an explicit owner.

### 2. CSS containment patch

Add `overflow: hidden`, increase minimum heights, and reduce type and spacing until the overlap disappears.

This is smaller but preserves the competition for height, hides content at short viewports, and is likely to regress when copy or criteria grow.

### 3. Full workspace redesign

Replace the three-panel workspace with a new navigation and interaction model.

This could improve the product more broadly but exceeds the reported problem and risks discarding working lead-review and evidence patterns.

## Proposed experience

### Stable assistant shell

The assistant column contains four vertical regions:

1. a fixed header;
2. a flexible, independently scrollable transcript;
3. a compact current-brief disclosure;
4. a fixed interaction footer containing the composer and run action.

The transcript receives all remaining height. A new message or thinking state scrolls the transcript to the latest entry. User scrolling remains possible; the automatic scroll occurs when the message collection or thinking state changes, not continuously.

The composer never uses fixed or absolute positioning outside its own bounded form, and no sibling is allowed to shrink it into overlap.

### Compact current brief

Replace the three always-visible criteria cards and the separate scoring card with one native `details` disclosure labeled **Current brief**. It is collapsed by default.

The summary shows a short scan line derived from the current state, for example:

> Canada · 3 categories · 3 metals · 4 exclusions · 41+ qualifies

Expanding the disclosure reveals:

- Must match;
- Prefer;
- Avoid;
- the scoring equation and weight controls currently available in the scoring disclosure.

The disclosure remains keyboard-operable and exposes its expanded state through native semantics. Long criteria wrap inside the expanded panel without changing the collapsed height.

### Run-state ownership

Remove the automatically opened detailed progress drawer from the assistant column. The assistant footer remains the place to start or stop a run and displays a compact status line while research is active.

Detailed progress belongs to the lead workspace:

- **Idle, no leads:** retain the current lead-queue empty state.
- **Running, no leads yet:** show the existing detailed run progress in the lead pane, including stage, accepted target, counters, and Stop search.
- **Running with partial leads:** show a slim live-status banner above the lead list while keeping accumulated leads reviewable.
- **Completed with leads:** show the normal lead list and a compact final outcome.
- **Cancelled, exhausted, or failed without leads:** show a distinct outcome panel with completed counts, the reason, and guidance to adjust the brief or start another run.
- **Cancelled, exhausted, or failed with partial leads:** preserve the lead list and show the outcome banner above it.

This keeps system status visible without allowing progress UI to displace the chat.

### Responsive behavior

- **Three-column desktop:** the workspace keeps a viewport-bounded height and each major pane scrolls internally as needed.
- **Two-column layout:** assistant and lead panes remain side by side; the evidence pane moves below as it does today. The assistant retains a useful transcript height because criteria and progress no longer compete for it.
- **Mobile:** panes stack in task order: assistant, leads/progress, evidence. The assistant is content-sized with a transcript minimum large enough to read several messages. The expanded brief becomes a single-column stack. Controls wrap without horizontal scrolling or overlap.
- **Short viewports:** the workspace may scroll as a page rather than forcing internal content below a minimum usable height.

## Component changes

### `CriteriaAssistant`

- Add a transcript ref and scroll-to-latest effect.
- Combine criteria readback and scoring preview under a new `CurrentBrief` disclosure.
- Keep the run action compact and reflect the active stage/counts when a run is present.
- Preserve existing chat submission, criteria updates, cancellation, and API-disabled behavior.

### `SourcingDashboard`

- Remove the live run drawer from the conversation column.
- Pass active-run and cancellation state to `LeadReviewWorkspace`.

### `LeadReviewWorkspace`

- Render run progress or outcome content in the lead pane when the queue is empty.
- Render a compact run banner when leads and a live or terminal run state coexist.
- Preserve filtering, selection, human decisions, and exports.

### Styling

- Replace height competition with explicit flex/grid ownership and `min-height: 0` on scrolling regions.
- Remove layout rules that rely on the assistant shrinking beneath its content.
- Add scoped styles for the current-brief disclosure and lead-pane run banners.
- Keep existing tokens, typography, colors, borders, and control shapes.

## Accessibility

- Use native `details`/`summary` behavior for the brief.
- Keep run progress in an `aria-live="polite"` region without duplicating the same live announcement in multiple panes.
- Retain visible text for Stop search; do not replace the destructive action with an unlabeled icon.
- Maintain logical focus order: header, transcript, brief, composer, run action, lead workspace.
- Ensure mobile targets remain at least 44px where space allows and that focus indicators are not clipped by scrolling containers.

## Testing

### Component tests

- The current brief is collapsed initially and exposes criteria and scoring when expanded.
- A new message and thinking state trigger a scroll request on the transcript.
- Starting/running state no longer renders a detailed progress drawer in the assistant column.
- The lead pane shows detailed progress when a run is active and the queue is empty.
- Partial leads remain visible during running, cancelled, exhausted, and failed states.
- Terminal no-lead states show distinct recovery copy.

### Visual verification

Perform one bounded browser pass across these states:

- idle;
- multi-message chat;
- running with no leads;
- running with partial leads;
- cancelled or failed;
- completed with leads.

Check at approximately 1440px desktop, 1114px two-column, 768px tablet, and 390px mobile widths. Confirm no overlap, clipped focus, horizontal page overflow, or hidden latest message. Fix findings in one batch and confirm once.

### Engineering verification

Run the focused component tests first, followed by the full test suite, lint, and production build.

## Success criteria

- The composer never overlaps run progress or another pane.
- The latest chat message is visible after it is appended.
- The idle assistant reserves substantially more height for conversation than for criteria controls.
- Starting a run does not change the assistant column's structural height.
- All run outcomes remain understandable and recoverable with or without partial leads.
- Desktop, two-column, tablet, and mobile layouts have no unintended horizontal overflow.
