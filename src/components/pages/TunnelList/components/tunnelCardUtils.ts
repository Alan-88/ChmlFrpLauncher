import type { UnifiedTunnel } from "../types";

export interface TunnelLinkInfo {
  display: string;
  copy: string;
}

function extractFirstDomain(raw?: string): string {
  if (!raw) return "";

  for (const candidate of raw.split(/[,;\s]+/g)) {
    const domain = (
      candidate.trim().match(/^[A-Za-z0-9.-]+/)?.[0] ?? ""
    ).replace(/^\.+|\.+$/g, "");
    if (domain) return domain;
  }

  return "";
}

export function getTunnelLinkInfo(tunnel: UnifiedTunnel): TunnelLinkInfo {
  if (tunnel.type === "api") {
    const type = tunnel.data.type.toUpperCase();
    const display =
      type === "HTTP" || type === "HTTPS"
        ? tunnel.data.dorp
        : `${tunnel.data.ip}:${tunnel.data.dorp}`;
    if (type !== "HTTP" && type !== "HTTPS") return { display, copy: display };

    const protocol = type === "HTTPS" ? "https" : "http";
    return {
      display,
      copy: display.includes("://") ? display : `${protocol}://${display}`,
    };
  }

  const type = (tunnel.data.tunnel_type || "").toLowerCase();
  if (type === "http" || type === "https") {
    const display =
      extractFirstDomain(tunnel.data.custom_domains) ||
      tunnel.data.subdomain ||
      tunnel.data.server_addr ||
      "-";
    return {
      display,
      copy: display === "-" ? `${type}://` : `${type}://${display}`,
    };
  }

  const display = `${tunnel.data.server_addr || "-"}:${tunnel.data.remote_port ?? tunnel.data.server_port ?? "-"}`;
  return { display, copy: display };
}
