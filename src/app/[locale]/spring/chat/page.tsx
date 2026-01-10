import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { type Locale, locales } from "@/i18n/config";
import { ChatPageClient } from "./chat-page-client";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ChatPage({ params }: Props) {
  const session = await auth();
  const { locale: localeParam } = await params;
  const locale = (locales.includes(localeParam as Locale) ? localeParam : 'en') as Locale;

  if (!session?.user) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/spring/chat`);
  }

  return <ChatPageClient locale={locale} user={session.user} />;
}
