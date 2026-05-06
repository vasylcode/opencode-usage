# opencode-usage

Small OpenCode TUI plugin that displays codex usage limits in the prompt area.

It reads your local OpenCode auth file, uses the current access token to fetch usage data, and displays the remaining percentage and reset time for the primary and secondary windows.

This plugin expects Opencode auth data at `~/.local/share/opencode/auth.json`

## Install

1. Clone this repo.
2. Run `npm install` in the repo.
3. Add the plugin path to your `~/.config/opencode/tui.json`.

Example:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "/absolute/path/to/opencode-usage/plugins/opencode-usage.tsx"
  ]
}
```

If you already have other TUI plugins, keep them and add this path to the same `plugin` array.
