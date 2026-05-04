import type { ReactNode } from "react";
import Link from "next/link";
import { SeiznLockup } from "@/components/landing/brand-marks";

interface AuthPageProps {
  subtitle: string;
  children?: ReactNode;
}

export function AuthPage({ subtitle, children }: AuthPageProps) {
  return (
    <main className="auth-page">
      <section className="auth-shell" aria-label={subtitle}>
        <AuthBrandHeader subtitle={subtitle} />
        {children}
      </section>
    </main>
  );
}

export function AuthBrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <header className="auth-brand">
      <Link href="/" className="auth-brand-link" aria-label="Seizn home">
        <SeiznLockup variant="graph" tone="dark" size="md" />
      </Link>
      <h1 className="auth-brand-subtitle">{subtitle}</h1>
    </header>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="auth-card">{children}</div>;
}

export function AuthHomeLink() {
  return (
    <p className="auth-back-row">
      <Link href="/" className="auth-back-link">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to home
      </Link>
    </p>
  );
}

export function AuthLoadingShell() {
  return <AuthPage subtitle="Loading..." />;
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="auth-divider">
      <div className="auth-divider-line" />
      <span className="auth-divider-label">{label}</span>
      <div className="auth-divider-line" />
    </div>
  );
}
