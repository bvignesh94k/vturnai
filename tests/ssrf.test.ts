import { describe, expect, it } from "vitest";
import {
  BlockedRequestError,
  assertPublicUrl,
  isBlockedHostname,
  isPrivateAddress,
  isPrivateIPv4,
  isPrivateIPv6,
} from "@/lib/security/ssrf";

/**
 * SSRF protection is the highest-consequence security control in the product:
 * the crawler fetches URLs a user typed. These tests pin the behaviour that
 * keeps it from being used to reach internal infrastructure.
 */

describe("isPrivateIPv4", () => {
  it("blocks loopback", () => {
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("127.255.255.254")).toBe(true);
  });

  it("blocks RFC 1918 ranges", () => {
    expect(isPrivateIPv4("10.0.0.1")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
  });

  it("blocks link-local, including the cloud metadata address", () => {
    expect(isPrivateIPv4("169.254.169.254")).toBe(true);
    expect(isPrivateIPv4("169.254.0.1")).toBe(true);
  });

  it("blocks carrier-grade NAT and reserved space", () => {
    expect(isPrivateIPv4("100.64.0.1")).toBe(true);
    expect(isPrivateIPv4("0.0.0.0")).toBe(true);
    expect(isPrivateIPv4("224.0.0.1")).toBe(true);
    expect(isPrivateIPv4("240.0.0.1")).toBe(true);
  });

  it("allows genuinely public addresses", () => {
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
    expect(isPrivateIPv4("93.184.216.34")).toBe(false);
  });

  it("fails closed on unparseable input", () => {
    expect(isPrivateIPv4("not-an-ip")).toBe(true);
    expect(isPrivateIPv4("999.1.1.1")).toBe(true);
    expect(isPrivateIPv4("10.0.0")).toBe(true);
  });
});

describe("isPrivateIPv6", () => {
  it("blocks loopback and unspecified", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("::")).toBe(true);
  });

  it("blocks unique local and link local", () => {
    expect(isPrivateIPv6("fc00::1")).toBe(true);
    expect(isPrivateIPv6("fd12:3456::1")).toBe(true);
    expect(isPrivateIPv6("fe80::1")).toBe(true);
  });

  it("blocks IPv4-mapped private addresses", () => {
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIPv6("::ffff:10.0.0.1")).toBe(true);
  });

  it("allows a public IPv6 address", () => {
    expect(isPrivateIPv6("2606:4700:4700::1111")).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("blocks known cloud metadata endpoints", () => {
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("169.254.170.2")).toBe(true);
    expect(isPrivateAddress("100.100.100.200")).toBe(true);
    expect(isPrivateAddress("192.0.0.192")).toBe(true);
  });

  it("fails closed for anything that is not an IP literal", () => {
    expect(isPrivateAddress("example.com")).toBe(true);
  });
});

describe("isBlockedHostname", () => {
  it("blocks localhost and its aliases", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("LOCALHOST")).toBe(true);
    expect(isBlockedHostname("app.localhost")).toBe(true);
  });

  it("blocks internal TLDs", () => {
    for (const host of ["db.internal", "printer.local", "wiki.corp", "api.lan", "site.test"]) {
      expect(isBlockedHostname(host)).toBe(true);
    }
  });

  it("blocks metadata hostnames", () => {
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("instance-data")).toBe(true);
  });

  it("blocks bare hostnames with no dot", () => {
    expect(isBlockedHostname("intranet")).toBe(true);
  });

  it("allows ordinary public hostnames", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
    expect(isBlockedHostname("www.vturnai.com")).toBe(false);
    expect(isBlockedHostname("sub.domain.co.in")).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("accepts a normal public https URL", () => {
    expect(() => assertPublicUrl("https://example.com/page")).not.toThrow();
  });

  it("rejects non-http schemes", () => {
    expect(() => assertPublicUrl("ftp://example.com")).toThrow(BlockedRequestError);
    expect(() => assertPublicUrl("file:///etc/passwd")).toThrow(BlockedRequestError);
  });

  it("rejects credentials in the URL", () => {
    try {
      assertPublicUrl("https://user:pass@example.com");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(BlockedRequestError);
      expect((error as BlockedRequestError).code).toBe("credentials_in_url");
    }
  });

  it("rejects non-standard ports", () => {
    try {
      assertPublicUrl("https://example.com:9200/_search");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as BlockedRequestError).code).toBe("blocked_port");
    }
  });

  it("rejects loopback and private literals", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://localhost:80/",
      "http://10.0.0.5/",
      "http://192.168.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
    ]) {
      expect(() => assertPublicUrl(url)).toThrow(BlockedRequestError);
    }
  });

  it("rejects malformed URLs", () => {
    try {
      assertPublicUrl("http://");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(BlockedRequestError);
    }
  });
});
