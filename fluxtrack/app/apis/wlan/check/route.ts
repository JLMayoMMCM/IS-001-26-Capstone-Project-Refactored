import { NextResponse, type NextRequest } from "next/server";

/**
 * IP allowlist check (per ADR-002).
 *
 * Reads MCM_WIFI_CIDRS env var: comma-separated list of CIDR blocks.
 * If unset, returns `on_campus: false` with source `no_match` — UI then
 * renders the self-declaration checkbox path.
 *
 * Browsers cannot read the WiFi SSID directly; this route is the
 * authoritative source of "are they on campus?" for FluxTrack.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request) ?? "";
  const cidrEnv = process.env.MCM_WIFI_CIDRS ?? "";
  const cidrs = cidrEnv.split(",").map((s) => s.trim()).filter(Boolean);

  const onCampus = cidrs.length > 0 && cidrs.some((cidr) => ipMatchesCidr(ip, cidr));

  return NextResponse.json(
    {
      on_campus: onCampus,
      source: onCampus ? "ip_match" : "no_match",
      // Include the resolved client IP for audit; useful when debugging
      // a "why am I off-campus?" complaint. The route does NOT report
      // SSID or signal — browsers can't expose those, and the UI now
      // reads connection type from navigator.connection client-side.
      client_ip: ip || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

/** Simple IPv4 CIDR match. Returns false on parse failure. */
function ipMatchesCidr(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false;
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!range || Number.isNaN(bits) || bits < 0 || bits > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
