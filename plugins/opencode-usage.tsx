/** @jsxImportSource @opentui/solid */
import { readFile } from "node:fs/promises"
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"

const id = "opencode-usage"
const authPath = `${process.env.HOME}/.local/share/opencode/auth.json`
const usageUrl = "https://chatgpt.com/backend-api/wham/usage"

type Auth = {
  type?: string
  access?: string
  accountId?: string
}

type WindowInfo = {
  usedPercent: number
  resetsAt: number | null
  windowSeconds: number | null
}

type UsageInfo = {
  primary: WindowInfo | null
  secondary: WindowInfo | null
}

type AuthFile = {
  openai?: Auth
}

async function readAuthFile() {
  return JSON.parse(await readFile(authPath, "utf8")) as AuthFile
}

async function getAuth() {
  const file = await readAuthFile()
  const auth = file.openai
  if (!auth?.access || !auth.accountId || auth.type !== "oauth") return
  return auth
}

function asWindow(value: unknown) {
  if (!value || typeof value !== "object") return null
  const data = value as Record<string, unknown>
  const usedPercent = typeof data.used_percent === "number" ? data.used_percent : data.usedPercent
  const resetsAt = typeof data.reset_at === "number" ? data.reset_at : data.resetsAt
  const windowSeconds =
    typeof data.limit_window_seconds === "number" ? data.limit_window_seconds : data.windowSeconds
  if (typeof usedPercent !== "number") return null
  return {
    usedPercent,
    resetsAt: typeof resetsAt === "number" ? resetsAt : null,
    windowSeconds: typeof windowSeconds === "number" ? windowSeconds : null,
  }
}

function fromPayload(payload: unknown): UsageInfo | undefined {
  if (!payload || typeof payload !== "object") return
  const data = payload as Record<string, unknown>
  const rateLimit = data.rate_limit
  if (!rateLimit || typeof rateLimit !== "object") return
  const details = rateLimit as Record<string, unknown>
  return {
    primary: asWindow(details.primary_window),
    secondary: asWindow(details.secondary_window),
  }
}

async function fetchUsage() {
  const auth = await getAuth()
  if (!auth?.access || !auth.accountId) return

  const response = await fetch(usageUrl, {
    headers: {
      Authorization: `Bearer ${auth.access}`,
      "ChatGPT-Account-Id": auth.accountId,
      "User-Agent": "codex-cli",
    },
  })

  if (!response.ok) return
  return fromPayload(await response.json())
}

function formatRemaining(resetsAt: number | null, now: number) {
  if (!resetsAt) return "?"
  const totalMinutes = Math.max(0, Math.ceil((resetsAt * 1000 - now) / 60_000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

function formatWeeklyPace(window: WindowInfo, now: number) {
  if (!window.resetsAt) return ""

  const duration = (window.windowSeconds ?? 7 * 24 * 60 * 60) * 1000
  if (duration <= 0) return ""

  const timeUntilReset = window.resetsAt * 1000 - now
  if (timeUntilReset <= 0 || timeUntilReset > duration) return ""

  const elapsed = Math.min(Math.max(duration - timeUntilReset, 0), duration)
  if (elapsed === 0 && window.usedPercent > 0) return ""

  const expectedUsedPercent = Math.min(Math.max((elapsed / duration) * 100, 0), 100)
  if (expectedUsedPercent < 3) return ""

  const actualUsedPercent = Math.min(Math.max(window.usedPercent, 0), 100)
  const delta = actualUsedPercent - expectedUsedPercent
  const rounded = Math.round(Math.abs(delta))
  if (rounded <= 2) return ""

  return delta < 0 ? ` +${rounded}%` : ` -${rounded}%`
}

function View(props: { theme: { textMuted: unknown } }) {
  const [usage, setUsage] = createSignal<UsageInfo>()
  const [now, setNow] = createSignal(Date.now())

  const load = async () => {
    const next = await fetchUsage().catch(() => undefined)
    if (next) setUsage(next)
  }

  onMount(() => {
    load()
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    const refresh = setInterval(load, 300_000)
    onCleanup(() => {
      clearInterval(tick)
      clearInterval(refresh)
    })
  })

  const text = createMemo(() => {
    const current = usage()
    const primary = current?.primary
    const secondary = current?.secondary
    if (!primary || !secondary) return
    return `${100 - primary.usedPercent}% (${formatRemaining(primary.resetsAt, now())}) ${100 - secondary.usedPercent}% (${formatRemaining(secondary.resetsAt, now())})${formatWeeklyPace(secondary, now())}`
  })

  return (
    <Show when={text()}>
      {(value) => (
        <box marginLeft={1}>
          <text fg={props.theme.textMuted as never} wrapMode="none">
            {value()}
          </text>
        </box>
      )}
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 1000,
    slots: {
      session_prompt(_ctx, props) {
        const prompt = props as {
          session_id: string
          visible?: boolean
          disabled?: boolean
          on_submit?: () => void
          ref?: (ref: unknown) => void
        }
        return (
          <api.ui.Prompt
            sessionID={prompt.session_id}
            visible={prompt.visible}
            disabled={prompt.disabled}
            onSubmit={prompt.on_submit}
            ref={prompt.ref}
            hint={<View theme={api.theme.current} />}
            right={<api.ui.Slot name="session_prompt_right" session_id={prompt.session_id} />}
          />
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
