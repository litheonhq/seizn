import { Arrow, Btn, Logo } from "./atoms";

const NAV_LINKS = [
  { label: "Docs",      href: "https://www.seizn.com/en/docs", external: true },
  { label: "Pricing",   href: "#pricing",                      external: false },
  { label: "Changelog", href: "#changelog",                    external: false },
  { label: "Blog",      href: "https://www.seizn.com/en/blog", external: true },
];

export function NavBar() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(14px)",
        background: "color-mix(in oklab, var(--engine-bg-base) 88%, transparent)",
        borderBottom: "1px solid var(--engine-line-soft)",
        color: "var(--engine-text-base)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "16px 56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Logo />
          <div style={{ display: "flex", gap: 24 }}>
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target={l.external ? "_blank" : undefined}
                rel={l.external ? "noopener noreferrer" : undefined}
                style={{ fontSize: 13, color: "var(--engine-text-muted)", textDecoration: "none" }}
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="https://www.seizn.com/login"
            style={{ fontSize: 13, color: "var(--engine-text-muted)", textDecoration: "none" }}
          >
            Sign in
          </a>
          <Btn variant="secondary" href="#playground" style={{ padding: "8px 14px", fontSize: 13 }}>
            Try playground
          </Btn>
          <Btn
            variant="primary"
            href="mailto:hello@seizn.com?subject=Engine%20demo%20request"
            icon={<Arrow />}
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            Book demo
          </Btn>
        </div>
      </div>
    </nav>
  );
}
