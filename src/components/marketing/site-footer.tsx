import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/config/site";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/ai-visibility", label: "AI Visibility" },
      { href: "/seo-audit", label: "SEO Audit" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/signup", label: "Start free trial" },
      { href: "/login", label: "Log in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-secondary/30">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {SITE.shortDescription}
            </p>
            <p className="mt-4 text-sm font-medium text-primary">{SITE.tagline}</p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t pt-8">
          <p className="text-xs leading-relaxed text-muted-foreground">
            © {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </p>
          <p className="mt-3 max-w-4xl text-xs leading-relaxed text-muted-foreground/80">
            {SITE.name} is an independent product. It is not affiliated with, endorsed by, or
            sponsored by OpenAI, Google, Anthropic, Perplexity, xAI or Microsoft. Engine names and
            marks belong to their respective owners and are used here only to describe which
            services we measure through their public developer APIs.
          </p>
        </div>
      </div>
    </footer>
  );
}
