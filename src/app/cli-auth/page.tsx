import Link from "next/link";
import type { ReactNode } from "react";
import { KeyRound, LogIn, ShieldCheck, Terminal } from "lucide-react";
import { auth } from "@/lib/auth";
import { CliAuthClient } from "./cli-auth-client";

export const metadata = {
  title: "CLI Auth | Seizn",
  description: "Create a Seizn CLI API key.",
};

export default async function CliAuthPage() {
  const session = await auth();
  const email = session?.user?.email || "";

  return (
    <main className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1fr_430px] lg:items-center lg:px-8">
        <section className="max-w-3xl">
          <Link href="/" className="mb-12 inline-flex items-center gap-3 text-sm text-szn-text-2 hover:text-szn-text-1">
            <span className="flex h-9 w-9 items-center justify-center border border-szn-border-subtle bg-szn-surface-1 text-sm font-semibold text-szn-text-1">
              S
            </span>
            Seizn
          </Link>

          <div className="szn-section-number mb-5">05 / CLI AUTH</div>
          <h1 className="szn-serif max-w-2xl text-5xl leading-[0.98] tracking-normal text-szn-text-1 sm:text-6xl lg:text-7xl">
            Ship canon changes from your terminal.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-szn-text-2">
            Generate a scoped API key, paste it into `seizn login`, then run replay, audit, bench, and canon workflows without opening the dashboard.
          </p>

          <div className="mt-10 grid max-w-2xl gap-px border border-szn-border-subtle bg-szn-border-subtle sm:grid-cols-3">
            <AuthSignal icon={<Terminal className="h-4 w-4" />} label="CLI" value="@seizn/cli" />
            <AuthSignal icon={<ShieldCheck className="h-4 w-4" />} label="Scope" value="Memory API" />
            <AuthSignal icon={<KeyRound className="h-4 w-4" />} label="Storage" value="0600 local file" />
          </div>
        </section>

        <section className="border border-szn-border-subtle bg-szn-surface-1 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          {session?.user ? (
            <CliAuthClient email={email} />
          ) : (
            <div className="space-y-6">
              <div>
                <div className="mb-4 flex h-11 w-11 items-center justify-center border border-szn-signal-line bg-szn-signal-soft text-szn-signal">
                  <LogIn className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-semibold text-szn-text-1">Sign in required</h2>
                <p className="mt-2 text-sm leading-6 text-szn-text-2">
                  CLI keys are created from your signed-in Seizn account.
                </p>
              </div>
              <Link
                href="/login?callbackUrl=/cli-auth"
                className="inline-flex w-full items-center justify-center gap-2 bg-szn-signal px-4 py-3 text-sm font-semibold text-szn-signal-fg transition hover:bg-szn-signal-hover"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function AuthSignal({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-szn-bg p-4">
      <div className="mb-4 flex h-8 w-8 items-center justify-center border border-szn-border-subtle bg-szn-surface-1 text-szn-text-2">
        {icon}
      </div>
      <div className="text-xs uppercase tracking-[0.18em] text-szn-text-3">{label}</div>
      <div className="mt-1 text-sm font-medium text-szn-text-1">{value}</div>
    </div>
  );
}
