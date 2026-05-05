import { Logo } from "./atoms";

const COLUMNS = [
  {
    title: "Product",
    items: [
      { label: "Docs",       href: "https://www.seizn.com/en/docs" },
      { label: "Pricing",    href: "#pricing" },
      { label: "Status",     href: "https://www.seizn.com/status" },
      { label: "Changelog",  href: "#changelog" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "Blog",    href: "https://www.seizn.com/en/blog" },
      { label: "GitHub",  href: "https://github.com/litheonhq/seizn" },
      { label: "Contact", href: "mailto:hello@seizn.com" },
      { label: "Careers", href: "https://www.seizn.com/en/careers" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Privacy",  href: "https://www.seizn.com/privacy" },
      { label: "Terms",    href: "https://www.seizn.com/terms" },
      { label: "Security", href: "https://www.seizn.com/security" },
      { label: "DPA",      href: "https://www.seizn.com/dpa" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--engine-line-soft)",
        padding: "56px",
        marginTop: 40,
        background: "var(--engine-bg-base)",
        color: "var(--engine-text-base)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.4fr repeat(3, 1fr)",
          gap: 40,
        }}
      >
        <div>
          <Logo />
          <p
            style={{
              marginTop: 14,
              fontSize: 12.5,
              color: "var(--engine-text-muted)",
              lineHeight: 1.6,
              maxWidth: 280,
            }}
          >
            Memory infrastructure for game NPCs. Built by Litheon LLC, Wyoming.
          </p>
          <div
            style={{
              marginTop: 18,
              padding: "12px 14px",
              border: "1px solid var(--engine-line)",
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              background: "var(--engine-bg-card)",
            }}
          >
            <span
              className="engine-mono"
              style={{ fontSize: 10.5, color: "var(--engine-text-dim)", letterSpacing: "0.10em", textTransform: "uppercase" }}
            >
              For writers →
            </span>
            <a
              href="https://www.seizn.com"
              className="engine-mono"
              style={{ fontSize: 12, color: "var(--engine-text-strong)", textDecoration: "none" }}
            >
              seizn.com
            </a>
          </div>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div
              className="engine-mono"
              style={{
                fontSize: 10.5,
                color: "var(--engine-text-dim)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              {col.title}
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {col.items.map((l) => {
                const external = l.href.startsWith("http") || l.href.startsWith("mailto:");
                return (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      style={{ fontSize: 13, color: "var(--engine-text-muted)", textDecoration: "none" }}
                    >
                      {l.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div
        className="engine-mono"
        style={{
          maxWidth: 1280,
          margin: "40px auto 0",
          paddingTop: 24,
          borderTop: "1px solid var(--engine-line-soft)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--engine-text-dim)" }}>
          © 2026 Seizn by Litheon LLC · Wyoming
        </span>
        <span style={{ fontSize: 11, color: "var(--engine-text-dim)" }}>
          Synthetic — demo data is not from a real game
        </span>
      </div>
    </footer>
  );
}
