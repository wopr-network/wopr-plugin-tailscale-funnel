# wopr-plugin-tailscale-funnel

Expose WOPR services externally via Tailscale Funnel — provides a public HTTPS URL without port forwarding.

## Commands

```bash
npm run build     # tsc
npm run check     # biome check + tsc --noEmit (run before committing)
npm run format    # biome format --write src/
npm test          # vitest run
```

## Architecture

```
src/
  index.ts  # Plugin entry — starts tailscale funnel, registers public URL
  types.ts  # Plugin-local types
```

## Key Details

- **Requires Tailscale** installed and authenticated on the host (`tailscale` CLI must be in PATH)
- Runs `tailscale funnel <port>` to expose the WOPR daemon publicly
- Registers the resulting public URL with plugins that need it (webhooks, GitHub, Slack HTTP mode, etc.)
- **Use case**: local dev with webhooks — avoids ngrok, cloudflare tunnel, etc.
- **Gotcha**: Tailscale Funnel must be enabled in the Tailscale admin console for the device before this works
- **Gotcha**: Funnel URL is stable per device name — bookmark it

## Plugin Contract

Imports only from `@wopr-network/plugin-types`. Never import from `@wopr-network/wopr` core.

## Issue Tracking

All issues in **Linear** (team: WOPR). Issue descriptions start with `**Repo:** wopr-network/wopr-plugin-tailscale-funnel`.
