import { getDictionary } from "@/i18n/get-dictionary";
import { Metadata } from "next";
import { type Locale } from "@/i18n/config";
import { EnterpriseClient } from "./enterprise-client";

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  await getDictionary(locale);

  const title =
    locale === "ko"
      ? "게임 스튜디오 엔터프라이즈 배포 | Seizn"
      : "Enterprise Deployment for Game Studios | Seizn";
  const description =
    locale === "ko"
      ? "Seizn 엔터프라이즈는 AI NPC 메모리를 게임 스튜디오 환경에 맞춰 셀프호스트, SSO, 프라이빗 네트워킹, 런칭 지원까지 함께 설계합니다."
      : "Seizn Enterprise helps game studios ship AI NPC memory with self-hosting, SSO, private networking, and launch support.";

  return {
    title,
    description,
  };
}

export default async function EnterprisePage({ params }: Props) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <EnterpriseClient dict={dict} locale={locale} />;
}
