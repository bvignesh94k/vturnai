import { ImageResponse } from "next/og";

/**
 * Home-screen icon. Apple crops to a rounded square and composites over an
 * opaque tile, so the mark is set on the brand's dark ground with breathing
 * room rather than shipped transparent and letting the OS decide.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0c0a22",
          backgroundImage:
            "radial-gradient(180px 180px at 20% 0%, rgba(124,58,237,0.45), rgba(124,58,237,0) 70%)",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="aa" x1="0" y1="0" x2="0.7" y2="1">
              <stop offset="0" stopColor="#22D3EE" />
              <stop offset="0.55" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#4F46E5" />
            </linearGradient>
            <linearGradient id="ab" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#4F46E5" />
              <stop offset="0.6" stopColor="#7C3AED" />
              <stop offset="1" stopColor="#A855F7" />
            </linearGradient>
            <linearGradient id="ac" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#A855F7" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 25 L46 78" stroke="url(#aa)" strokeWidth="17" />
            <path d="M46 78 L79.5 22.5" stroke="url(#ab)" strokeWidth="17" />
            <path d="M57.5 26.6 L82 18 L86.2 43.7" stroke="url(#ac)" strokeWidth="14.5" />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
