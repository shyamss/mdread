// Pluggable bind-host resolution. mdread itself is network-agnostic: Tailscale is
// just one built-in resolver, and any other network (WireGuard, a VPN, a specific
// NIC) can be plugged in via MDREAD_HOST_CMD.

const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
const LOOPBACK = "127.0.0.1";

// Run a shell command with retry (the network may not be up yet at boot).
// Returns the first IPv4 in the output, else the first non-empty line, else null.
async function resolveViaCommand(cmd: string, retries = 30, delayMs = 2000): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const proc = Bun.spawn(["sh", "-c", cmd], { stdout: "pipe", stderr: "ignore" });
      const out = (await new Response(proc.stdout).text()).trim();
      if ((await proc.exited) === 0 && out) {
        return out.match(IPV4)?.[0] ?? out.split("\n")[0]!.trim();
      }
    } catch {
      /* command missing / spawn failed */
    }
    if (i < retries - 1) await Bun.sleep(delayMs);
  }
  return null;
}

// Built-in resolver shortcuts, selectable via MDREAD_HOST / --host.
const BUILTIN: Record<string, string> = {
  tailscale: "tailscale ip -4",
};

/**
 * Decide which host to bind. Priority:
 *   1. explicit `opt` (--host) or $MDREAD_HOST — an IP/hostname, or a builtin name
 *      ("tailscale"), or "auto" to use $MDREAD_HOST_CMD.
 *   2. $MDREAD_HOST_CMD — any command printing a host/IP (the pluggable hook).
 *   3. 127.0.0.1 — network-agnostic default.
 */
export async function resolveHost(opt?: string): Promise<string> {
  const want = opt ?? process.env.MDREAD_HOST;

  if (want && want !== "auto") {
    const builtin = BUILTIN[want];
    if (!builtin) return want; // explicit IP/hostname
    const ip = await resolveViaCommand(builtin);
    if (ip) return ip;
    console.error(`could not resolve host via "${builtin}"; falling back to ${LOOPBACK}`);
    return LOOPBACK;
  }

  const cmd = process.env.MDREAD_HOST_CMD;
  if (cmd) {
    const out = await resolveViaCommand(cmd);
    if (out) return out;
    console.error(`MDREAD_HOST_CMD failed; falling back to ${LOOPBACK}`);
    return LOOPBACK;
  }

  return LOOPBACK;
}
