import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileCode2 } from "lucide-react";
import { locales, type Locale } from "@/i18n/config";
import { BENCH_TASKS } from "@/lib/bench/leaderboard";

type Props = {
  params: Promise<{ locale: string }>;
};

const RUNNER_URL = "https://github.com/litheonhq/seizn/blob/main/scripts/bench/run.py";

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
    title: "Benchmark methodology",
    description: "How Seizn scores weekly NPC memory infrastructure benchmarks.",
    alternates: {
      canonical: `/${locale}/bench/methodology`,
    },
    openGraph: {
      title: "Benchmark methodology",
      description: "Six public memory tasks, normalized scoring, and downloadable raw benchmark data.",
      type: "article",
    },
  };
}

export default async function BenchMethodologyPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);

  return (
    <main className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <section className="border-b border-szn-border-subtle bg-szn-surface-1 px-6 py-14 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link href={`/${locale}/bench`} className="inline-flex items-center gap-2 text-sm text-szn-text-2 hover:text-szn-text-1">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Benchmark leaderboard
          </Link>
          <p className="szn-section-number mt-10">14 / METHODOLOGY</p>
          <h1 className="szn-serif mt-4 max-w-4xl text-5xl font-semibold tracking-normal sm:text-6xl">
            Reproducible memory tasks for NPC systems.
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-szn-text-2">
            The public leaderboard runs one suite across Seizn, Mem0, Zep, and LangChain Memory. Each
            task reports a raw metric, a normalized 0-100 score, and a rank. Lower-is-better metrics are
            inverted before scoring, so the best observed system always receives 100 for that task.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-6 py-10 sm:px-8 lg:grid-cols-2 lg:px-10">
        {BENCH_TASKS.map((task, index) => (
          <article key={task.id} className="rounded-lg border border-szn-border-subtle bg-szn-card p-5">
            <p className="szn-eyebrow">Task {String(index + 1).padStart(2, "0")}</p>
            <h2 className="mt-3 text-xl font-semibold tracking-normal">{task.label}</h2>
            <p className="mt-3 text-sm leading-6 text-szn-text-2">{task.description}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-szn-text-3">Metric</dt>
                <dd className="mt-1 font-mono text-szn-text-1">{task.unit}</dd>
              </div>
              <div>
                <dt className="text-szn-text-3">Direction</dt>
                <dd className="mt-1 font-mono text-szn-text-1">{task.better === "higher" ? "higher wins" : "lower wins"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16 sm:px-8 lg:px-10">
        <div className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-6">
          <div className="flex items-center gap-3">
            <FileCode2 className="h-5 w-5 text-szn-signal" aria-hidden="true" />
            <h2 className="text-lg font-semibold tracking-normal">Runner and raw data</h2>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-szn-text-2">
            Weekly automation executes the benchmark runner, writes JSON and CSV artifacts, and publishes
            completed runs into the public `bench_runs` and `bench_results` tables. The leaderboard uses
            the latest completed database run and falls back to the deterministic reference dataset when
            no published run is available.
          </p>
          <a
            href={RUNNER_URL}
            className="szn-btn-ghost mt-5 inline-flex items-center gap-2 px-3 py-2 text-sm"
            target="_blank"
            rel="noreferrer"
          >
            View runner script
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>
    </main>
  );
}
