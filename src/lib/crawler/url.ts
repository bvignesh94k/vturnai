/**
 * URL normalization and crawl-scope rules.
 *
 * Two URLs that render the same page must collapse to one key, otherwise a
 * 500-URL budget is wasted on duplicates. These functions are pure and fully
 * unit tested, the crawler depends on them for both correctness and safety.
 */

/** Query parameters that never change the rendered content. */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_source_platform",
  "gclid",
  "gbraid",
  "wbraid",
  "dclid",
  "fbclid",
  "msclkid",
  "twclid",
  "ttclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "yclid",
  "_ga",
  "_gl",
  "ref",
  "referrer",
  "source",
  "campaignid",
  "adgroupid",
  "hsa_acc",
  "hsa_cam",
  "hsa_grp",
  "hsa_ad",
  "hsa_src",
  "hsa_tgt",
  "hsa_kw",
  "hsa_mt",
  "hsa_net",
  "hsa_ver",
  "vero_conv",
  "vero_id",
  "s_kwcid",
  "sscid",
]);

/** Path fragments that indicate a page a crawler must not visit. */
const EXCLUDED_PATH_PATTERNS: readonly RegExp[] = [
  /\/wp-admin(\/|$)/i,
  /\/wp-login\.php/i,
  /\/wp-json(\/|$)/i,
  /\/xmlrpc\.php/i,
  /\/admin(\/|$)/i,
  /\/administrator(\/|$)/i,
  /\/dashboard(\/|$)/i,
  /\/account(\/|$)/i,
  /\/my-account(\/|$)/i,
  /\/login(\/|$)/i,
  /\/signin(\/|$)/i,
  /\/sign-in(\/|$)/i,
  /\/signup(\/|$)/i,
  /\/sign-up(\/|$)/i,
  /\/register(\/|$)/i,
  /\/logout(\/|$)/i,
  /\/signout(\/|$)/i,
  /\/sign-out(\/|$)/i,
  /\/cart(\/|$)/i,
  /\/basket(\/|$)/i,
  /\/checkout(\/|$)/i,
  /\/order-received(\/|$)/i,
  /\/wishlist(\/|$)/i,
  /\/compare(\/|$)/i,
  /\/search(\/|$)/i,
  /\/cdn-cgi(\/|$)/i,
  /\/feed(\/|$)/i,
  /\/comment-page-\d+/i,
  /\/trackback(\/|$)/i,
  /\/print(\/|$)/i,
];

/** Query keys whose presence means the URL is a search or session variant. */
const EXCLUDED_QUERY_KEYS = new Set([
  "s",
  "q",
  "query",
  "search",
  "sessionid",
  "sid",
  "phpsessid",
  "jsessionid",
  "add-to-cart",
  "remove_item",
  "replytocom",
  "share",
  "print",
]);

/** File extensions that are not HTML documents. */
const NON_HTML_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "ico", "bmp", "tiff",
  "css", "js", "mjs", "map", "json", "xml", "rss", "atom",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "csv",
  "zip", "gz", "tar", "rar", "7z", "bz2",
  "mp3", "mp4", "avi", "mov", "wmv", "webm", "ogg", "wav", "flac", "m4a", "mkv",
  "woff", "woff2", "ttf", "eot", "otf",
  "exe", "dmg", "apk", "deb", "rpm", "msi",
]);

/** Maximum number of distinct query parameters before a URL is treated as a facet trap. */
export const MAX_QUERY_PARAMS = 2;

/** Maximum path segments before a URL is treated as a crawl trap. */
export const MAX_PATH_DEPTH = 8;

export interface NormalizeOptions {
  /** Keep the query string entirely (used for sitemap-declared URLs). */
  keepQuery?: boolean;
  /** Force a trailing slash policy. Default: strip, except for the root path. */
  trailingSlash?: "strip" | "keep";
}

/**
 * Normalize a URL into the canonical form used as a de-duplication key.
 *
 * - lower-cases scheme and host, strips `www.` is NOT done (www is a distinct origin)
 * - removes the fragment
 * - removes default ports
 * - drops tracking parameters and sorts the rest
 * - strips the trailing slash except on the root path
 *
 * Returns `null` when the input is not an absolute http(s) URL.
 */
export function normalizeUrl(input: string, options: NormalizeOptions = {}): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") return null;
  if (!url.hostname) return null;

  url.protocol = protocol;
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  url.hash = "";
  url.username = "";
  url.password = "";

  if (
    (protocol === "http:" && url.port === "80") ||
    (protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  if (options.keepQuery) {
    const sorted = new URLSearchParams(
      [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
    url.search = sorted.toString() ? `?${sorted.toString()}` : "";
  } else {
    const kept: Array<[string, string]> = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) continue;
      kept.push([key, value]);
    }
    kept.sort(([a], [b]) => (a === b ? 0 : a < b ? -1 : 1));
    const params = new URLSearchParams(kept);
    const query = params.toString();
    url.search = query ? `?${query}` : "";
  }

  // Collapse duplicate slashes in the path, then apply the trailing-slash policy.
  let pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (options.trailingSlash === "keep") {
    if (!pathname.endsWith("/")) pathname = `${pathname}/`;
  } else if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.replace(/\/+$/, "");
    if (pathname === "") pathname = "/";
  }
  url.pathname = pathname;

  return url.toString();
}

/** Normalize a user-supplied website address into an absolute origin URL. */
export function normalizeSiteUrl(input: string): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const normalized = normalizeUrl(withScheme);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    // A site URL is always stored as an origin plus optional base path.
    return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

/** Extract the registrable-ish host used for domain matching (drops a leading `www.`). */
export function toRegistrableHost(input: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

/** True when `candidate` is the same host as `base`, or a subdomain of it. */
export function isSameSite(candidate: string, base: string): boolean {
  const candidateHost = toRegistrableHost(candidate);
  const baseHost = toRegistrableHost(base);
  if (!candidateHost || !baseHost) return false;
  return candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`);
}

/** Strict same-origin check (scheme + host + port must all match). */
export function isSameOrigin(candidate: string, base: string): boolean {
  try {
    return new URL(candidate).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export function fileExtension(pathname: string): string | null {
  const lastSegment = pathname.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0 || dot === lastSegment.length - 1) return null;
  return lastSegment.slice(dot + 1).toLowerCase();
}

export function isLikelyHtmlUrl(url: string): boolean {
  try {
    const extension = fileExtension(new URL(url).pathname);
    if (!extension) return true;
    if (NON_HTML_EXTENSIONS.has(extension)) return false;
    return true;
  } catch {
    return false;
  }
}

export interface CrawlEligibility {
  eligible: boolean;
  reason?:
    | "invalid-url"
    | "off-site"
    | "excluded-path"
    | "excluded-query"
    | "non-html"
    | "too-many-params"
    | "too-deep";
}

/**
 * Decide whether the crawler should fetch a URL. Keeps the crawl on-site, out
 * of authenticated or transactional areas, and away from infinite facet spaces.
 */
export function evaluateCrawlEligibility(candidate: string, baseUrl: string): CrawlEligibility {
  const normalized = normalizeUrl(candidate);
  if (!normalized) return { eligible: false, reason: "invalid-url" };
  if (!isSameSite(normalized, baseUrl)) return { eligible: false, reason: "off-site" };

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { eligible: false, reason: "invalid-url" };
  }

  if (!isLikelyHtmlUrl(normalized)) return { eligible: false, reason: "non-html" };

  for (const pattern of EXCLUDED_PATH_PATTERNS) {
    if (pattern.test(url.pathname)) return { eligible: false, reason: "excluded-path" };
  }

  const paramKeys = [...url.searchParams.keys()];
  for (const key of paramKeys) {
    if (EXCLUDED_QUERY_KEYS.has(key.toLowerCase())) {
      return { eligible: false, reason: "excluded-query" };
    }
  }
  if (paramKeys.length > MAX_QUERY_PARAMS) {
    return { eligible: false, reason: "too-many-params" };
  }

  const depth = url.pathname.split("/").filter(Boolean).length;
  if (depth > MAX_PATH_DEPTH) return { eligible: false, reason: "too-deep" };

  return { eligible: true };
}

/** Resolve a possibly relative href against a page URL, returning a normalized absolute URL. */
export function resolveLink(href: string, pageUrl: string): string | null {
  const trimmed = href?.trim();
  if (!trimmed) return null;
  if (/^(mailto:|tel:|javascript:|data:|sms:|whatsapp:|#)/i.test(trimmed)) return null;
  try {
    return normalizeUrl(new URL(trimmed, pageUrl).toString());
  } catch {
    return null;
  }
}
