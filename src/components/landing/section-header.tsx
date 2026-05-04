export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  tone = "light",
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  tone?: "light" | "dark";
  align?: "left" | "center";
}) {
  const isDark = tone === "dark";

  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl text-left"}>
      {eyebrow ? (
        <p className="author-eyebrow mb-4" style={{ color: isDark ? "oklch(1 0 0 / 0.58)" : "var(--ink-500)" }}>
          {eyebrow}
        </p>
      ) : null}
      <h2 className="author-serif text-[length:var(--t-h2)]" style={{ color: isDark ? "var(--ink-0)" : "var(--ink-900)" }}>
        {title}
      </h2>
      {subtitle ? (
        <p
          className="mt-4 text-base leading-7 md:text-lg"
          style={{ color: isDark ? "oklch(1 0 0 / 0.66)" : "var(--ink-600)", textWrap: "pretty" }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
