# CursorMobileAccess — Wire Protocol

Semantic contract between the PC **bridge** and the **web client** (phone browser).

The phone never sees Cursor DOM, CSS selectors, or CDP details. The bridge maps IDE UI → this model and maps client intents → CDP actions. Clients: **web UI** and **Android app** (`apps/android`).

## Design principles

1. **Own UI** — clients render timeline + actions however they want; nothing here mirrors Cursor chrome.
2. **Opaque action IDs** — approve/run/skip use bridge-issued `actionId` values; click targets stay server-side.
3. **Snapshots + patches** — full state on connect; incremental field patches while streaming.
4. **Intents, not clicks** — client sends `send_message` / `invoke_action` / `select_tab`, not coordinates.

## Transport

- WebSocket over Tailscale to the bridge (TLS optional via Tailscale Serve).
- First message after connect: `auth` with bearer token.
- JSON frames, one object per message, `type` discriminator.

## Agent phase

| Phase | Meaning | Typical push |
| --- | --- | --- |
| `disconnected` | CDP/relay not attached | yes |
| `idle` | Ready for a prompt | yes (after work) |
| `thinking` | Model generating | no |
| `tool` | Tool/command running | no |
| `awaiting_input` | Needs human (approve, question, run) | **yes** |
| `error` | Extractor/CDP failure | yes |

## Snapshot shape

```ts
SessionSnapshot {
  connection: { cdp: boolean }
  windows: WindowInfo[]
  activeWindowId: string | null
  tabs: TabInfo[]
  phase: AgentPhase
  activityText?: string
  pendingPrompt?: string   // live AskQuestion tray text
  mode?: string
  model?: string
  timeline: TimelineItem[]
  actions: Action[]   // pending; empty when idle
}
```

### Timeline items (UI-agnostic)

| `kind` | Fields | Notes |
| --- | --- | --- |
| `user` | `text` | Human prompt |
| `assistant` | `markdown`, optional `codeBlocks[]` | Prose as markdown, not Cursor HTML widgets |
| `thought` | `summary?`, `durationSec?` | Collapsible in UI |
| `tool` | `title`, `detail?`, `status` | Generic tool card |
| `command` | `command`, `description?` | Shell run card |
| `plan` | `title`, `summary?`, `todos[]` | Plan card |
| `question` | `prompt`, `options[]` | Multi-choice; answers via `invoke_action` |

Every item has stable `id` (bridge-assigned; prefer Cursor’s id when available).

### Actions

```ts
Action {
  id: string           // opaque
  kind: 'approve' | 'reject' | 'run' | 'skip' | 'allow'
      | 'build' | 'view_plan' | 'answer' | 'custom'
  label: string        // button copy for UI
  targetItemId?: string
  optionId?: string    // for kind: 'answer'
}
```

## Client → server

| `type` | Payload | Effect |
| --- | --- | --- |
| `auth` | `{ token }` | Required once |
| `command` | `{ commandId, op, ...fields }` | Flat intent — see ops |

### Command ops

| `op` | Extra fields |
| --- | --- |
| `send_message` | `text` |
| `invoke_action` | `actionId` |
| `fill_freeform` | `text` — Other answer text before Continue |
| `attach_files` | `files: [{ name, mime, dataBase64 }]`, optional `text`, optional `submit` (default true) |
| `select_window` | `windowId` |
| `select_tab` | `tabId` |
| `new_chat` | — |
| `set_mode` | `mode` |
| `set_model` | `model` |

Example: `{ "type": "command", "commandId": "c-1", "op": "invoke_action", "actionId": "a-9" }`

## Server → client

| `type` | Payload |
| --- | --- |
| `auth_ok` / `auth_error` | `{ message? }` |
| `snapshot` | `SessionSnapshot` |
| `patch` | Partial `SessionSnapshot` fields (replace-by-key for arrays when present) |
| `command_result` | `{ commandId, ok, error? }` |
| `attention` | `{ reason, title, body }` — hint for ntfy / local notification |

`attention.reason`: `awaiting_input` | `became_idle` | `disconnected` | `error`

## Patch rules

- Omitted fields = unchanged.
- When `timeline` is present, it is the **full** timeline for the active tab (v1 simplicity).
- When `actions` is present, it is the **full** pending action list.
- Bridge may later switch to timeline append ops; clients should tolerate full replace.

## Security

- CDP (`9222`) listens on localhost only.
- Bridge binds to Tailscale IP or localhost; the web client connects via MagicDNS or Tailscale IP.
- Shared secret token on `auth`; reject all other frames until authenticated.

## Non-goals (v1)

- Pixel-perfect Cursor clone
- Exposing CSS `selectorPath` to the client
- Telegram / multi-tenant auth
- Persistent cloud history
