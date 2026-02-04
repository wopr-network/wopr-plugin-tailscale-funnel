/**
 * WOPR Tailscale Funnel Plugin
 *
 * Exposes local WOPR services to the internet via Tailscale Funnel.
 * Other plugins can use the funnel extension to get public URLs.
 */

import { spawn, execSync } from "node:child_process";
import type {
  WOPRPlugin,
  WOPRPluginContext,
  FunnelConfig,
  FunnelExtension,
  FunnelStatus,
  FunnelInfo,
} from "./types.js";

// ============================================================================
// State
// ============================================================================

let ctx: WOPRPluginContext | null = null;
let hostname: string | null = null;
let available: boolean | null = null;

// Tailscale Funnel only supports ONE active funnel at a time
// Exposing a new port will replace the previous one
let activeFunnel: (FunnelInfo & { pid?: number }) | null = null;

// ============================================================================
// Tailscale CLI Helpers
// ============================================================================

function exec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

async function checkTailscaleAvailable(): Promise<boolean> {
  if (available !== null) return available;

  // Check if tailscale CLI exists
  const which = exec("which tailscale");
  if (!which) {
    ctx?.log.warn("Tailscale CLI not found. Install: curl -fsSL https://tailscale.com/install.sh | sh");
    available = false;
    return false;
  }

  // Check if tailscale is running and connected
  const status = exec("tailscale status --json");
  if (!status) {
    ctx?.log.warn("Tailscale not running or not connected");
    available = false;
    return false;
  }

  try {
    const parsed = JSON.parse(status);
    if (parsed.BackendState !== "Running") {
      ctx?.log.warn(`Tailscale backend state: ${parsed.BackendState}`);
      available = false;
      return false;
    }

    // Extract hostname
    hostname = parsed.Self?.DNSName?.replace(/\.$/, "") || null;
    if (hostname) {
      ctx?.log.info(`Tailscale connected: ${hostname}`);
    }

    available = true;
    return true;
  } catch {
    available = false;
    return false;
  }
}

async function getTailscaleHostname(): Promise<string | null> {
  if (hostname) return hostname;
  await checkTailscaleAvailable();
  return hostname;
}

async function startFunnel(port: number, path: string = "/"): Promise<string | null> {
  if (!(await checkTailscaleAvailable())) {
    return null;
  }

  if (!hostname) {
    ctx?.log.error("No Tailscale hostname available");
    return null;
  }

  // Check if already exposed on this port
  if (activeFunnel?.active && activeFunnel.port === port) {
    ctx?.log.debug?.(`Port ${port} already exposed at ${activeFunnel.publicUrl}`);
    return activeFunnel.publicUrl;
  }

  // Tailscale only supports ONE funnel at a time - stop any existing funnel
  if (activeFunnel?.active) {
    ctx?.log.info(`Replacing existing funnel on port ${activeFunnel.port} with port ${port}`);
    await stopFunnel(activeFunnel.port);
  }

  try {
    // Start funnel in background
    // tailscale funnel <port> exposes on 443 by default
    const funnelProcess = spawn("tailscale", ["funnel", String(port)], {
      detached: true,
      stdio: "ignore",
    });
    funnelProcess.unref();

    // Build public URL
    // Funnel always uses HTTPS on port 443
    const publicUrl = `https://${hostname}${path === "/" ? "" : path}`;

    activeFunnel = {
      port,
      path,
      publicUrl,
      active: true,
      pid: funnelProcess.pid,
    };

    ctx?.log.info(`Funnel started: ${publicUrl} -> localhost:${port}`);
    return publicUrl;
  } catch (err) {
    ctx?.log.error(`Failed to start funnel for port ${port}: ${err}`);
    return null;
  }
}

async function stopFunnel(port: number): Promise<boolean> {
  if (!activeFunnel || activeFunnel.port !== port) {
    return false;
  }

  try {
    // Stop the funnel using 'tailscale funnel off' or by killing the process
    // The correct syntax is: tailscale funnel <port> off
    exec(`tailscale funnel ${port} off`);

    // Also try to kill the process if we have the PID
    if (activeFunnel.pid) {
      try {
        process.kill(activeFunnel.pid, "SIGTERM");
      } catch {
        // Process may already be dead
      }
    }

    activeFunnel = null;
    ctx?.log.info(`Funnel stopped for port ${port}`);
    return true;
  } catch (err) {
    ctx?.log.error(`Failed to stop funnel for port ${port}: ${err}`);
    return false;
  }
}

// ============================================================================
// Extension
// ============================================================================

const funnelExtension: FunnelExtension = {
  async isAvailable() {
    return checkTailscaleAvailable();
  },

  async getHostname() {
    return getTailscaleHostname();
  },

  async expose(port: number, path?: string) {
    return startFunnel(port, path || "/");
  },

  async unexpose(port: number) {
    return stopFunnel(port);
  },

  getUrl(port: number) {
    return activeFunnel?.port === port ? activeFunnel.publicUrl : null;
  },

  getStatus(): FunnelStatus {
    return {
      available: available ?? false,
      hostname: hostname || undefined,
      funnels: activeFunnel ? [activeFunnel] : [],
    };
  },
};

// ============================================================================
// Plugin
// ============================================================================

const plugin: WOPRPlugin = {
  name: "wopr-plugin-tailscale-funnel",
  version: "1.0.0",
  description: "Expose WOPR services externally via Tailscale Funnel",

  configSchema: {
    title: "Tailscale Funnel",
    description: "Expose a local service to the internet via Tailscale Funnel (one port at a time)",
    fields: [
      {
        name: "enabled",
        type: "boolean",
        label: "Enable Funnel",
        description: "Enable Tailscale Funnel integration",
        default: true,
      },
      {
        name: "expose",
        type: "object",
        label: "Auto-expose port",
        description: "Port to automatically expose on startup (only one supported)",
      },
    ],
  },

  commands: [
    {
      name: "funnel",
      description: "Tailscale Funnel management",
      usage: "wopr funnel <status|expose|unexpose> [port]",
      async handler(cmdCtx, args) {
        const [subcommand, portArg] = args;

        if (subcommand === "status") {
          const status = funnelExtension.getStatus();
          if (!status.available) {
            cmdCtx.log.info("Tailscale Funnel: not available");
            cmdCtx.log.info("  Make sure Tailscale is installed and running");
            return;
          }
          cmdCtx.log.info(`Tailscale Funnel: available`);
          cmdCtx.log.info(`  Hostname: ${status.hostname}`);
          cmdCtx.log.info(`  Active funnels: ${status.funnels.length}`);
          for (const f of status.funnels) {
            cmdCtx.log.info(`    - ${f.publicUrl} -> localhost:${f.port}`);
          }
          return;
        }

        if (subcommand === "expose") {
          if (!portArg) {
            cmdCtx.log.error("Usage: wopr funnel expose <port>");
            return;
          }
          const port = parseInt(portArg, 10);
          if (isNaN(port)) {
            cmdCtx.log.error("Invalid port number");
            return;
          }
          const url = await funnelExtension.expose(port);
          if (url) {
            cmdCtx.log.info(`Exposed: ${url} -> localhost:${port}`);
          } else {
            cmdCtx.log.error("Failed to expose port");
          }
          return;
        }

        if (subcommand === "unexpose") {
          if (!portArg) {
            cmdCtx.log.error("Usage: wopr funnel unexpose <port>");
            return;
          }
          const port = parseInt(portArg, 10);
          if (isNaN(port)) {
            cmdCtx.log.error("Invalid port number");
            return;
          }
          const success = await funnelExtension.unexpose(port);
          if (success) {
            cmdCtx.log.info(`Stopped funnel for port ${port}`);
          } else {
            cmdCtx.log.error("Failed to stop funnel");
          }
          return;
        }

        cmdCtx.log.info("Usage: wopr funnel <status|expose|unexpose> [port]");
      },
    },
  ],

  async init(pluginCtx) {
    ctx = pluginCtx;
    const config = ctx.getConfig<FunnelConfig>();

    if (config?.enabled === false) {
      ctx.log.info("Tailscale Funnel plugin loaded (disabled)");
      return;
    }

    // Register extension first so other plugins can use it
    ctx.registerExtension("funnel", funnelExtension);

    // Check availability
    const isAvailable = await checkTailscaleAvailable();
    if (!isAvailable) {
      ctx.log.warn("Tailscale Funnel not available - install Tailscale and run 'tailscale up'");
      return;
    }

    // Auto-expose configured port (only one supported by Tailscale)
    if (config?.expose) {
      // Support both old array format (use first item) and new object format
      const exposeConfig = Array.isArray(config.expose) ? config.expose[0] : config.expose;
      if (exposeConfig?.port) {
        const url = await startFunnel(exposeConfig.port, exposeConfig.path);
        if (url) {
          ctx.log.info(`Auto-exposed: ${url}`);
        }
      }
    }

    ctx.log.info("Tailscale Funnel plugin initialized");
  },

  async shutdown() {
    // Stop active funnel if any
    if (activeFunnel) {
      await stopFunnel(activeFunnel.port);
    }

    ctx?.unregisterExtension("funnel");
    ctx = null;
    hostname = null;
    available = null;
  },
};

export default plugin;
export type { FunnelExtension, FunnelStatus, FunnelInfo };
