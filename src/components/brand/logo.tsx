import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * V Turn AI identity.
 *
 * The geometry here is the vector original from the brand pack
 * (`public/brand/vturnai-icon.svg`), a V whose second stroke does not stop at
 * the vertex but turns and rises into an arrow. Do not re-draw, re-colour or
 * re-space it: the gradients below are the brand gradients, stated in the exact
 * hex values from the brand sheet rather than theme tokens, so the mark reads
 * identically in light mode, dark mode, print and third-party embeds.
 *
 * Brand colours: Indigo 800 #3730A3 · Violet 600 #7C3AED · Cyan 400 #22D3EE · Ink #15132E
 */

const MARK_GRADIENTS = [
  { key: "a", x1: "0", y1: "0", x2: "0.7", y2: "1", stops: [["0", "#22D3EE"], ["0.55", "#3B82F6"], ["1", "#3730A3"]] },
  { key: "b", x1: "0", y1: "1", x2: "1", y2: "0", stops: [["0", "#3730A3"], ["0.6", "#5B32D6"], ["1", "#7C3AED"]] },
  { key: "c", x1: "0", y1: "1", x2: "1", y2: "0", stops: [["0", "#7C3AED"], ["1", "#22D3EE"]] },
] as const;

export function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  const uid = React.useId();
  const gid = (key: string) => `${uid}-${key}`.replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="V Turn AI"
      className={cn("size-8", className)}
      {...props}
    >
      <defs>
        {MARK_GRADIENTS.map((gradient) => (
          <linearGradient
            key={gradient.key}
            id={gid(gradient.key)}
            x1={gradient.x1}
            y1={gradient.y1}
            x2={gradient.x2}
            y2={gradient.y2}
          >
            {gradient.stops.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
        ))}
      </defs>
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* Down-stroke of the V. */}
        <path d="M14 25 L46 78" stroke={`url(#${gid("a")})`} strokeWidth="17" />
        {/* Up-stroke, carried past the vertex. */}
        <path d="M46 78 L79.5 22.5" stroke={`url(#${gid("b")})`} strokeWidth="17" />
        {/* The turn: an arrowhead resolving the rise. */}
        <path d="M57.5 26.6 L82 18 L86.2 43.7" stroke={`url(#${gid("c")})`} strokeWidth="14.5" />
      </g>
    </svg>
  );
}

/**
 * The wordmark. Set in the display face (Sora 800, −3% tracking) with the two
 * gradient-filled segments the brand sheet specifies: a cool V, ink "Turn",
 * and a violet-to-cyan "AI".
 */
export function Wordmark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "font-display text-[17px] font-extrabold leading-none tracking-[-0.03em] text-foreground",
        className,
      )}
      {...props}
    >
      <span className="bg-[linear-gradient(45deg,#4338CA,#22D3EE)] bg-clip-text text-transparent">V</span>
      Turn
      <span className="bg-[linear-gradient(45deg,#7C3AED,#22D3EE)] bg-clip-text text-transparent">AI</span>
    </span>
  );
}

export function Logo({
  className,
  wordmarkClassName,
  showWordmark = true,
  showTagline = false,
  ...props
}: React.ComponentProps<"div"> & {
  wordmarkClassName?: string;
  showWordmark?: boolean;
  showTagline?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} {...props}>
      <LogoMark className={showTagline ? "size-11" : "size-8"} />
      {showWordmark ? (
        <span className="flex flex-col gap-1">
          <Wordmark className={wordmarkClassName} />
          {showTagline ? (
            <span className="text-[9px] font-semibold uppercase leading-none tracking-[0.22em] text-muted-foreground">
              Be Found. Be Cited. Be Chosen.
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
