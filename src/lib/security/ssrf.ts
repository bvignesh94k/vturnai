/**
 * SSRF protection for every outbound fetch made on behalf of a user.
 *
 * The crawler, the PageSpeed helper and the content optimizer all accept URLs
 * that a user typed. Without this guard a user could point V Turn AI at
 * `http://169.254.169.254/` and read cloud instance credentials, or at an
 * internal service on the deployment network.
 *
 * Defence is in two layers:
 *   1. `assertPublicUrl` rejects obviously private hosts before any I/O.
 *   2. `resolveAndAssertPublicHost` resolves DNS and rejects the request when
 *      any resolved address is private — this catches DNS names that point at
 *      internal space, including rebinding attempts at resolution time.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class BlockedRequestError extends Error {
  readonly code: string;
  constructor(message: string, code = "blocked_request") {
    super(message);
    this.name = "BlockedRequestError";
    this.code = code;
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".private",
  ".test",
  ".example",
  ".invalid",
  ".onion",
];

/** Cloud metadata endpoints that must never be reachable. */
const BLOCKED_IPS = new Set([
  "169.254.169.254", // AWS / GCP / Azure / DigitalOcean IMDS
  "169.254.170.2", // AWS ECS task metadata
  "100.100.100.200", // Alibaba Cloud metadata
  "192.0.0.192", // Oracle Cloud metadata
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** RFC 1918 / 5735 / 6598 / 3927 and other non-routable IPv4 ranges. */
const PRIVATE_IPV4_RANGES: ReadonlyArray<{ cidr: string; base: number; mask: number }> = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
].map((cidr) => {
  const [address, bits] = cidr.split("/");
  const base = ipv4ToInt(address ?? "") ?? 0;
  const prefix = Number(bits ?? 32);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { cidr, base: (base & mask) >>> 0, mask };
});

export function isPrivateIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // Unparseable: fail closed.
  return PRIVATE_IPV4_RANGES.some((range) => ((value & range.mask) >>> 0) === range.base);
}

export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (normalized === "::" || normalized === "::1") return true;
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible addresses.
  const mapped = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  // Unique local (fc00::/7), link local (fe80::/10), multicast (ff00::/8),
  // discard (100::/64), documentation (2001:db8::/32), 6to4 relay (2002::/16).
  if (/^f[cd]/.test(normalized)) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (/^ff/.test(normalized)) return true;
  if (normalized.startsWith("100:")) return true;
  if (normalized.startsWith("2001:db8")) return true;
  if (normalized.startsWith("2002:")) return true;
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (BLOCKED_IPS.has(ip)) return true;
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // Not an IP literal: fail closed.
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // A bare hostname with no dot cannot be a public site.
  if (!host.includes(".") && isIP(host) === 0) return true;
  if (isIP(host) !== 0) return isPrivateAddress(host);
  return false;
}

export interface AssertPublicUrlResult {
  url: URL;
  hostname: string;
}

/**
 * Synchronous, no-I/O validation. Rejects non-http(s) schemes, credentials in
 * the URL, non-standard ports and hostnames that are private on their face.
 */
export function assertPublicUrl(input: string): AssertPublicUrlResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlockedRequestError("The address is not a valid URL.", "invalid_url");
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new BlockedRequestError(
      "Only http and https addresses can be analysed.",
      "unsupported_scheme",
    );
  }

  if (url.username || url.password) {
    throw new BlockedRequestError(
      "Addresses containing credentials are not allowed.",
      "credentials_in_url",
    );
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new BlockedRequestError(
      "Only the standard web ports 80 and 443 can be analysed.",
      "blocked_port",
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname)) {
    throw new BlockedRequestError(
      "That address points at a private or internal network and cannot be analysed.",
      "private_host",
    );
  }

  return { url, hostname };
}

/**
 * Full validation including DNS resolution. Every resolved address must be
 * public; a single private answer blocks the request.
 */
export async function resolveAndAssertPublicHost(input: string): Promise<AssertPublicUrlResult> {
  const result = assertPublicUrl(input);

  // Literal IPs were already validated by `assertPublicUrl`.
  if (isIP(result.hostname) !== 0) return result;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(result.hostname, { all: true, verbatim: true });
  } catch {
    throw new BlockedRequestError(
      "That domain could not be resolved.",
      "dns_resolution_failed",
    );
  }

  if (addresses.length === 0) {
    throw new BlockedRequestError("That domain has no public address.", "dns_no_records");
  }

  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) {
      throw new BlockedRequestError(
        "That domain resolves to a private network address and cannot be analysed.",
        "private_host",
      );
    }
  }

  return result;
}
