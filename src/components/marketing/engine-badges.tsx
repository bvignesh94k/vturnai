import { ENGINE_LIST } from "@/lib/config/engines";
import { SEARCH_ENGINES } from "@/lib/config/engines";
import { cn } from "@/lib/utils";

/**
 * Engine identification without borrowed branding.
 *
 * We deliberately use neutral monogram tiles rather than the engines' own
 * logos: reproducing their marks would imply a partnership that does not exist.
 */
export function EngineBadges({ className }: { className?: string }) {
  const entries = [
    ...SEARCH_ENGINES.map((engine) => ({
      key: engine.id,
      name: engine.name,
      monogram: engine.monogram,
      accent: "var(--muted-foreground)",
    })),
    ...ENGINE_LIST.map((engine) => ({
      key: engine.id,
      name: engine.name,
      monogram: engine.monogram,
      accent: engine.accent,
    })),
  ];

  return (
    <ul className={cn("flex flex-wrap items-center justify-center gap-2.5", className)}>
      {entries.map((entry) => (
        <li
          key={entry.key}
          className="flex items-center gap-2 rounded-full border bg-card/70 py-1.5 pl-1.5 pr-3.5 text-sm font-medium backdrop-blur"
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: entry.accent }}
          >
            {entry.monogram}
          </span>
          {entry.name}
        </li>
      ))}
    </ul>
  );
}
