import { Arrow, Btn, Logo, Pill } from "../_components/atoms";

const AUTHOR_LOGIN_URL = "https://www.seizn.com/login?callbackUrl=/dashboard/author";

export default function EngineLoginBridgePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--engine-bg-base)",
        color: "var(--engine-text-base)",
        display: "grid",
        placeItems: "center",
        padding: 32,
      }}
    >
      <section
        style={{
          width: "min(100%, 560px)",
          border: "1px solid var(--engine-line-bright)",
          borderRadius: 12,
          background: "rgba(255,255,255,0.035)",
          padding: 32,
          boxShadow: "0 24px 80px -48px rgba(124, 58, 237, 0.75)",
        }}
      >
        <Logo />
        <div style={{ marginTop: 28 }}>
          <Pill tone="violet">Author account</Pill>
        </div>
        <h1
          style={{
            margin: "18px 0 0",
            fontSize: 36,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: "var(--engine-text-strong)",
          }}
        >
          Open the Author workspace on Seizn.
        </h1>
        <p style={{ margin: "16px 0 0", color: "var(--engine-text-muted)", lineHeight: 1.7 }}>
          Engine uses the same Seizn account for API keys, usage, and billing. Sign in on the main
          Seizn surface, then return here for engine docs and runtime tools.
        </p>
        <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Btn variant="primary" href={AUTHOR_LOGIN_URL} icon={<Arrow />}>
            Continue to Author
          </Btn>
          <Btn variant="secondary" href="/engine">
            Back to Engine
          </Btn>
        </div>
      </section>
    </main>
  );
}
