# wopr-plugin-tailscale-funnel

Expose WOPR services to the internet via [Tailscale Funnel](https://tailscale.com/kb/1223/funnel).

> **Note:** Tailscale Funnel only supports **one port at a time**. Exposing a new port will automatically stop the previous funnel.

## Prerequisites

- [Tailscale](https://tailscale.com/download) installed and running (`tailscale up`)
- Funnel enabled on your tailnet (see [Tailscale docs](https://tailscale.com/kb/1223/funnel#setup))

## Installation

```bash
wopr plugin add wopr-network/wopr-plugin-tailscale-funnel
```

## Configuration

In your WOPR config (`~/.wopr/config.json`):

```json
{
  "plugins": {
    "wopr-plugin-tailscale-funnel": {
      "enabled": true,
      "expose": { "port": 7437, "path": "/" }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `expose` | object | - | Port to auto-expose on startup (one port only) |

## CLI Commands

```bash
# Check funnel status
wopr funnel status

# Expose a port (replaces any existing funnel)
wopr funnel expose 8080

# Stop exposing a port
wopr funnel unexpose 8080
```

## Extension API

Other plugins can use the funnel extension:

```typescript
const funnel = ctx.getExtension("funnel") as FunnelExtension;

// Check availability
const available = await funnel.isAvailable();

// Get public hostname
const hostname = await funnel.getHostname();

// Expose a port and get public URL (replaces any existing funnel)
const url = await funnel.expose(8080, "/api");

// Stop exposing
await funnel.unexpose(8080);

// Get URL for the currently exposed port
const existingUrl = funnel.getUrl(8080);

// Get full status
const status = funnel.getStatus();
```

## How It Works

1. Plugin checks if Tailscale is installed and connected
2. When exposing a port, it runs `tailscale funnel <port>` in the background
3. Traffic to `https://<your-hostname>.ts.net/` routes to `localhost:<port>`
4. Other plugins (like `wopr-plugin-github`) can use the extension to get public URLs
5. **Only one funnel can be active** - exposing a new port stops the previous one

## Limitations

- **Single port only:** Tailscale Funnel supports one exposed port at a time per machine
- Exposing a new port will automatically stop any existing funnel

## Operational Notes

### Tailscale Must Be Running First

Tailscale daemon (`tailscaled`) must be running before WOPR starts. In containerized environments:

```bash
# Ensure tailscale is up
tailscale up --authkey=<your-key>

# Clear any conflicting listeners before starting funnel
tailscale serve reset

# Then start WOPR
wopr daemon
```

### Container Setup

For Docker containers, run in privileged mode and ensure Tailscale auto-starts:

```dockerfile
# In your entrypoint
tailscaled --state=/var/lib/tailscale/tailscaled.state &
sleep 2
tailscale up --authkey=${TAILSCALE_AUTHKEY}
```

### Troubleshooting

- **"listener already exists"**: Run `tailscale serve reset` to clear existing funnels
- **Funnel not accessible**: Verify funnel is enabled on your tailnet in the admin console
- **Port not exposed**: Check `tailscale funnel status` for current state

## License

MIT
