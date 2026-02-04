# wopr-plugin-tailscale-funnel

Expose WOPR services to the internet via [Tailscale Funnel](https://tailscale.com/kb/1223/funnel).

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
      "expose": [
        { "port": 7437, "path": "/" }
      ]
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `expose` | array | `[]` | Ports to auto-expose on startup |

## CLI Commands

```bash
# Check funnel status
wopr funnel status

# Expose a port
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

// Expose a port and get public URL
const url = await funnel.expose(8080, "/api");

// Stop exposing
await funnel.unexpose(8080);

// Get URL for already-exposed port
const existingUrl = funnel.getUrl(8080);

// Get full status
const status = funnel.getStatus();
```

## How It Works

1. Plugin checks if Tailscale is installed and connected
2. When exposing a port, it runs `tailscale funnel <port>` in the background
3. Traffic to `https://<your-hostname>.ts.net/` routes to `localhost:<port>`
4. Other plugins (like `wopr-plugin-github`) can use the extension to get public URLs

## License

MIT
