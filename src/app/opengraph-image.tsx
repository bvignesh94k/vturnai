import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config/site";

/**
 * The share card. Rendered from the brand's own colours and geometry so a link
 * to V Turn AI is recognisable in a feed, a Slack unfurl, or a search result's
 * rich preview before a single word is read.
 */
export const alt = `${SITE.name} · ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Fetch the display face so the share card is set in the same type as the
 * wordmark. Degrades to the renderer's default rather than failing the build:
 * a card in a fallback face still ships, a broken build does not.
 */
async function loadSora(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Sora:wght@800&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((response) => response.text());

    const url = /src:\s*url\((https:\/\/[^)]+\.(?:woff2|ttf))\)/.exec(css)?.[1];
    if (!url) return null;

    const font = await fetch(url);
    if (!font.ok) return null;
    return await font.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const sora = await loadSora();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 88px",
          position: "relative",
          backgroundColor: "#0c0a22",
          // Painted on the root rather than in child elements: a positioned
          // div carrying a gradient leaves a visible rectangular seam, and this
          // identity is built from strokes and light, never from boxes.
          backgroundImage:
            "radial-gradient(1100px 780px at 6% -14%, rgba(124,58,237,0.55), rgba(124,58,237,0) 62%), radial-gradient(1000px 760px at 104% 116%, rgba(34,211,238,0.30), rgba(34,211,238,0) 60%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <svg width="104" height="104" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="oa" x1="0" y1="0" x2="0.7" y2="1">
                <stop offset="0" stopColor="#22D3EE" />
                <stop offset="0.55" stopColor="#3B82F6" />
                <stop offset="1" stopColor="#4F46E5" />
              </linearGradient>
              <linearGradient id="ob" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#4F46E5" />
                <stop offset="0.6" stopColor="#7C3AED" />
                <stop offset="1" stopColor="#A855F7" />
              </linearGradient>
              <linearGradient id="oc" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#A855F7" />
                <stop offset="1" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 25 L46 78" stroke="url(#oa)" strokeWidth="17" />
              <path d="M46 78 L79.5 22.5" stroke="url(#ob)" strokeWidth="17" />
              <path d="M57.5 26.6 L82 18 L86.2 43.7" stroke="url(#oc)" strokeWidth="14.5" />
            </g>
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontFamily: "Sora",
                fontSize: 52,
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: -1.6,
              }}
            >
              VTurnAI
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: "#9d9abb",
                letterSpacing: 4.2,
              }}
            >
              BE FOUND. BE CITED. BE CHOSEN.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 54,
            fontFamily: "Sora",
            fontSize: 64,
            lineHeight: 1.14,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: -2.4,
            maxWidth: 940,
            display: "flex",
          }}
        >
          See how visible your brand is everywhere people search
        </div>

        <div
          style={{
            marginTop: 30,
            fontSize: 28,
            lineHeight: 1.45,
            color: "#b8b5d0",
            maxWidth: 880,
            display: "flex",
          }}
        >
          SEO · AEO · GEO · HEO in one score, across Google, Bing, ChatGPT, Gemini, Claude,
          Perplexity and Grok.
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: 10,
            background: "linear-gradient(90deg, #22D3EE 0%, #3B82F6 34%, #4F46E5 66%, #7C3AED 100%)",
          }}
        />
      </div>
    ),
    {
      ...size,
      ...(sora
        ? { fonts: [{ name: "Sora", data: sora, weight: 800 as const, style: "normal" as const }] }
        : {}),
    },
  );
}
