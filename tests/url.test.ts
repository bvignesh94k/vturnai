import { describe, expect, it } from "vitest";
import {
  evaluateCrawlEligibility,
  fileExtension,
  isLikelyHtmlUrl,
  isSameOrigin,
  isSameSite,
  normalizeSiteUrl,
  normalizeUrl,
  resolveLink,
  toRegistrableHost,
} from "@/lib/crawler/url";

describe("normalizeUrl", () => {
  it("lower-cases the scheme and host but preserves path case", () => {
    expect(normalizeUrl("HTTPS://Example.COM/MyPage")).toBe("https://example.com/MyPage");
  });

  it("removes the fragment", () => {
    expect(normalizeUrl("https://example.com/page#section-2")).toBe("https://example.com/page");
  });

  it("strips default ports", () => {
    expect(normalizeUrl("https://example.com:443/page")).toBe("https://example.com/page");
    expect(normalizeUrl("http://example.com:80/page")).toBe("http://example.com/page");
  });

  it("keeps a non-default port", () => {
    expect(normalizeUrl("https://example.com:8443/page")).toBe("https://example.com:8443/page");
  });

  it("strips the trailing slash except on the root path", () => {
    expect(normalizeUrl("https://example.com/about/")).toBe("https://example.com/about");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("collapses duplicate slashes in the path", () => {
    expect(normalizeUrl("https://example.com//a///b")).toBe("https://example.com/a/b");
  });

  it("drops tracking parameters", () => {
    expect(normalizeUrl("https://example.com/p?utm_source=x&utm_medium=y&id=7")).toBe(
      "https://example.com/p?id=7",
    );
    expect(normalizeUrl("https://example.com/p?gclid=abc&fbclid=def")).toBe("https://example.com/p");
  });

  it("sorts remaining query parameters so equivalent URLs collapse to one key", () => {
    expect(normalizeUrl("https://example.com/p?b=2&a=1")).toBe(
      normalizeUrl("https://example.com/p?a=1&b=2"),
    );
  });

  it("strips credentials embedded in the URL", () => {
    expect(normalizeUrl("https://user:pass@example.com/p")).toBe("https://example.com/p");
  });

  it("rejects non-http schemes", () => {
    expect(normalizeUrl("ftp://example.com/file")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("mailto:hi@example.com")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });

  it("can keep the query when asked", () => {
    expect(normalizeUrl("https://example.com/p?utm_source=x", { keepQuery: true })).toBe(
      "https://example.com/p?utm_source=x",
    );
  });
});

describe("normalizeSiteUrl", () => {
  it("adds https when the scheme is missing", () => {
    expect(normalizeSiteUrl("example.com")).toBe("https://example.com");
  });

  it("preserves a base path", () => {
    expect(normalizeSiteUrl("example.com/in")).toBe("https://example.com/in");
  });

  it("returns the origin without a trailing slash for a root URL", () => {
    expect(normalizeSiteUrl("https://example.com/")).toBe("https://example.com");
  });

  it("rejects nonsense", () => {
    expect(normalizeSiteUrl("   ")).toBeNull();
  });
});

describe("toRegistrableHost", () => {
  it("drops a leading www", () => {
    expect(toRegistrableHost("https://www.example.com/x")).toBe("example.com");
  });

  it("keeps other subdomains", () => {
    expect(toRegistrableHost("https://blog.example.com")).toBe("blog.example.com");
  });

  it("accepts a bare host", () => {
    expect(toRegistrableHost("example.com")).toBe("example.com");
  });
});

describe("isSameSite", () => {
  it("treats www and apex as the same site", () => {
    expect(isSameSite("https://www.example.com/a", "https://example.com")).toBe(true);
  });

  it("treats a subdomain as the same site", () => {
    expect(isSameSite("https://blog.example.com/a", "https://example.com")).toBe(true);
  });

  it("rejects a different domain", () => {
    expect(isSameSite("https://example.org/a", "https://example.com")).toBe(false);
  });

  it("rejects a domain that merely ends with the same string", () => {
    expect(isSameSite("https://notexample.com/a", "https://example.com")).toBe(false);
  });
});

describe("isSameOrigin", () => {
  it("requires scheme, host and port to match", () => {
    expect(isSameOrigin("https://example.com/a", "https://example.com/b")).toBe(true);
    expect(isSameOrigin("http://example.com/a", "https://example.com/b")).toBe(false);
    expect(isSameOrigin("https://www.example.com/a", "https://example.com/b")).toBe(false);
  });
});

describe("fileExtension and isLikelyHtmlUrl", () => {
  it("extracts the extension", () => {
    expect(fileExtension("/files/report.PDF")).toBe("pdf");
    expect(fileExtension("/about")).toBeNull();
    expect(fileExtension("/trailing.")).toBeNull();
  });

  it("treats extensionless paths as HTML", () => {
    expect(isLikelyHtmlUrl("https://example.com/about")).toBe(true);
    expect(isLikelyHtmlUrl("https://example.com/page.html")).toBe(true);
  });

  it("rejects non-HTML assets", () => {
    expect(isLikelyHtmlUrl("https://example.com/a.pdf")).toBe(false);
    expect(isLikelyHtmlUrl("https://example.com/a.jpg")).toBe(false);
    expect(isLikelyHtmlUrl("https://example.com/a.css")).toBe(false);
    expect(isLikelyHtmlUrl("https://example.com/feed.xml")).toBe(false);
  });
});

describe("evaluateCrawlEligibility", () => {
  const base = "https://example.com";

  it("accepts an ordinary on-site page", () => {
    expect(evaluateCrawlEligibility("https://example.com/pricing", base)).toEqual({
      eligible: true,
    });
  });

  it("rejects off-site URLs", () => {
    expect(evaluateCrawlEligibility("https://other.com/page", base).reason).toBe("off-site");
  });

  it("rejects authenticated and transactional paths", () => {
    for (const path of ["/cart", "/checkout", "/wp-admin/", "/login", "/my-account", "/logout"]) {
      expect(evaluateCrawlEligibility(`${base}${path}`, base).reason).toBe("excluded-path");
    }
  });

  it("rejects on-site search URLs", () => {
    expect(evaluateCrawlEligibility(`${base}/results?q=shoes`, base).reason).toBe("excluded-query");
  });

  it("rejects facet traps with too many parameters", () => {
    expect(
      evaluateCrawlEligibility(`${base}/list?colour=red&size=9&brand=x&sort=asc`, base).reason,
    ).toBe("too-many-params");
  });

  it("rejects paths that are too deep", () => {
    expect(evaluateCrawlEligibility(`${base}/a/b/c/d/e/f/g/h/i/j`, base).reason).toBe("too-deep");
  });

  it("rejects non-HTML assets", () => {
    expect(evaluateCrawlEligibility(`${base}/brochure.pdf`, base).reason).toBe("non-html");
  });

  it("rejects invalid URLs", () => {
    expect(evaluateCrawlEligibility("::::", base).reason).toBe("invalid-url");
  });
});

describe("resolveLink", () => {
  it("resolves a relative path against the page URL", () => {
    expect(resolveLink("/about", "https://example.com/blog/post")).toBe("https://example.com/about");
    expect(resolveLink("../up", "https://example.com/a/b/c")).toBe("https://example.com/a/up");
  });

  it("ignores non-navigational hrefs", () => {
    for (const href of ["mailto:a@b.com", "tel:+911234567890", "javascript:void(0)", "#anchor", "data:text/plain,x"]) {
      expect(resolveLink(href, "https://example.com/")).toBeNull();
    }
  });

  it("ignores blank hrefs", () => {
    expect(resolveLink("   ", "https://example.com/")).toBeNull();
  });
});
