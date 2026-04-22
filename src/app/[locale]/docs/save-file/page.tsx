import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { LandingNav } from "@/components/shared/site-nav";

type Props = {
  params: Promise<{ locale: string }>;
};

const copy = {
  en: {
    title: "Save-File Format",
    description:
      "SZN1 is Seizn's signed portable NPC memory bundle for game save files.",
    eyebrow: "Docs / Save-File",
    heading: "Signed NPC state for game save files",
    intro:
      "Export one NPC's memories, belief shards, and canon locks into a compact .szs bundle, then import it into another Seizn project after signature verification.",
    layoutTitle: "Wire format",
    bodyTitle: "JSON body",
    signingTitle: "Signing model",
    signing:
      "Each studio has one active Ed25519 keypair. The server encrypts the PKCS8 private key with AES-256-GCM using SEIZN_SIGNING_MASTER_KEY, signs the header plus gzip body, and appends the raw public key for offline verification.",
    cliTitle: "CLI round-trip",
    rejectionTitle: "Import rejection rules",
    rejection: [
      "Invalid SZN1 magic bytes.",
      "Body length that does not match the file.",
      "Ed25519 signature failure after any tampering.",
      "Unsupported version or schemaVersion.",
    ],
  },
  ko: {
    title: "Save-File 포맷",
    description:
      "SZN1은 게임 세이브 파일에 넣을 수 있는 Seizn의 서명된 NPC 메모리 번들입니다.",
    eyebrow: "문서 / Save-File",
    heading: "게임 세이브 파일용 서명된 NPC 상태",
    intro:
      "NPC 한 명의 memories, belief shards, canon locks를 작은 .szs 번들로 내보내고, 서명 검증 후 다른 Seizn 프로젝트로 가져옵니다.",
    layoutTitle: "와이어 포맷",
    bodyTitle: "JSON 본문",
    signingTitle: "서명 모델",
    signing:
      "각 스튜디오는 활성 Ed25519 키페어 하나를 가집니다. 서버는 SEIZN_SIGNING_MASTER_KEY로 PKCS8 개인키를 AES-256-GCM 암호화하고, 헤더와 gzip 본문에 서명한 뒤 오프라인 검증용 raw public key를 파일 끝에 붙입니다.",
    cliTitle: "CLI 왕복",
    rejectionTitle: "Import 거부 규칙",
    rejection: [
      "SZN1 magic bytes가 올바르지 않은 파일.",
      "본문 길이가 실제 파일 길이와 맞지 않는 파일.",
      "변조로 Ed25519 서명 검증에 실패한 파일.",
      "지원하지 않는 version 또는 schemaVersion.",
    ],
  },
} as const;

function getLocale(localeParam: string): Locale {
  return (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
}

function getCopy(locale: Locale) {
  return locale === "ko" ? copy.ko : copy.en;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);
  const text = getCopy(locale);

  return {
    title: text.title,
    description: text.description,
    alternates: {
      canonical: `/${locale}/docs/save-file`,
    },
    openGraph: {
      title: text.title,
      description: text.description,
      type: "website",
    },
  };
}

export default async function SaveFileDocsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);
  const text = getCopy(locale);

  return (
    <div className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <LandingNav locale={locale} />
    <main>
      <section className="mx-auto max-w-5xl px-6 py-20 sm:px-8 lg:px-10">
        <p className="szn-eyebrow">{text.eyebrow}</p>
        <div className="szn-section-number mt-8">DOCS / SAVE-FILE</div>
        <h1 className="szn-serif mt-5 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
          {text.heading}
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-szn-text-2 sm:text-lg">
          {text.intro}
        </p>
      </section>

      <section className="border-y border-szn-border-subtle bg-szn-surface-1">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
          <div>
            <p className="szn-section-number">SZN1</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">{text.layoutTitle}</h2>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-szn-border-subtle bg-szn-bg p-4 text-sm leading-6 text-szn-text-2">
            <code>{'[4 bytes magic "SZN1"][8 bytes length][gzip(json body)][64 bytes ed25519 sig][32 bytes pubkey]'}</code>
          </pre>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-8 px-6 py-12 sm:px-8 lg:grid-cols-2 lg:px-10">
        <article className="szn-surface-1 rounded-lg p-6">
          <h2 className="text-xl font-semibold tracking-normal">{text.bodyTitle}</h2>
          <pre className="mt-5 overflow-x-auto rounded-md border border-szn-border-subtle bg-szn-bg p-4 text-sm leading-6 text-szn-text-2">
            <code>{`{
  "version": "SZN1",
  "exportedAt": "2026-04-21T00:00:00.000Z",
  "studioId": "uuid",
  "npcId": "kaelan",
  "schemaVersion": 1,
  "memories": [],
  "beliefs": [],
  "canonLocks": [],
  "meta": {
    "memoryCount": 0,
    "beliefCount": 0,
    "canonLockCount": 0
  }
}`}</code>
          </pre>
        </article>

        <article className="szn-surface-1 rounded-lg p-6">
          <h2 className="text-xl font-semibold tracking-normal">{text.signingTitle}</h2>
          <p className="mt-5 text-sm leading-7 text-szn-text-2">{text.signing}</p>
          <h3 className="mt-8 text-base font-semibold tracking-normal">{text.cliTitle}</h3>
          <pre className="mt-4 overflow-x-auto rounded-md border border-szn-border-subtle bg-szn-bg p-4 text-sm leading-6 text-szn-text-2">
            <code>{`seizn save export <npc_id> <out.szs>
seizn save import <in.szs>`}</code>
          </pre>
        </article>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20 sm:px-8 lg:px-10">
        <article className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-6">
          <h2 className="text-xl font-semibold tracking-normal">{text.rejectionTitle}</h2>
          <ul className="mt-5 grid gap-3 text-sm leading-6 text-szn-text-2 sm:grid-cols-2">
            {text.rejection.map((item) => (
              <li key={item} className="rounded-md border border-szn-border-subtle bg-szn-bg px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
    </div>
  );
}
