import type { Metadata } from "next";
import Link from "next/link";
import { Box, Code2, ExternalLink } from "lucide-react";
import { locales, type Locale } from "@/i18n/config";

type Props = {
  params: Promise<{ locale: string }>;
};

function getLocale(localeParam: string): Locale {
  return (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);

  return {
    title: "Unity SDK Quickstart",
    description: "Install the Seizn Unity package and call NPC memory, canon, and replay APIs from Unity 2022.3 LTS.",
    alternates: {
      canonical: `/${locale}/docs/unity-quickstart`,
    },
  };
}

export default async function UnityQuickstartPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);

  return (
    <main className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <section className="border-b border-szn-border-subtle bg-szn-surface-1 px-6 py-14 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link href={`/${locale}/docs`} className="text-sm text-szn-text-2 hover:text-szn-text-1">
            Docs
          </Link>
          <p className="szn-section-number mt-10">16 / UNITY SDK</p>
          <h1 className="szn-serif mt-4 max-w-4xl text-5xl font-semibold tracking-normal sm:text-6xl">
            Add Seizn memory to a Unity NPC.
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-szn-text-2">
            The Unity package is source-first, targets Unity 2022.3 LTS, and uses UnityWebRequest for
            memory writes, memory search, Canon Lock checks, and replay fetches.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-6 py-10 sm:px-8 lg:grid-cols-2 lg:px-10">
        <article className="rounded-lg border border-szn-border-subtle bg-szn-card p-5">
          <Box className="h-5 w-5 text-szn-signal" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold tracking-normal">Install</h2>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-szn-bg p-4 text-xs text-szn-text-2">
            <code>https://github.com/litheonhq/seizn.git?path=/packages/seizn-unity</code>
          </pre>
          <p className="mt-4 text-sm leading-6 text-szn-text-2">
            Add the package by Git URL in Package Manager, then open Window &gt; Seizn &gt; Settings.
          </p>
        </article>

        <article className="rounded-lg border border-szn-border-subtle bg-szn-card p-5">
          <Code2 className="h-5 w-5 text-szn-signal" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold tracking-normal">Use</h2>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-szn-bg p-4 text-xs leading-5 text-szn-text-2">
            <code>{`var client = new SeiznClient(apiKey);
var memory = await client.Memory.CreateAsync(npcId, "Player gave me a sword");
var results = await client.Memory.SearchAsync(npcId, "sword", limit: 10);
var verdict = await client.Canon.CheckAsync(npcId, proposedLine);`}</code>
          </pre>
        </article>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16 sm:px-8 lg:px-10">
        <div className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-6">
          <h2 className="text-lg font-semibold tracking-normal">Manual final steps</h2>
          <p className="mt-3 text-sm leading-6 text-szn-text-2">
            `.unitypackage` compilation and Unity Asset Store submission require local Unity Editor access
            plus the user&apos;s publisher credentials, so this repository ships the package source and sample
            instead of uploading to Asset Store.
          </p>
          <a
            href="https://github.com/litheonhq/seizn/tree/main/packages/seizn-unity"
            target="_blank"
            rel="noreferrer"
            className="szn-btn-ghost mt-5 inline-flex items-center gap-2 px-3 py-2 text-sm"
          >
            Package source
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>
    </main>
  );
}
