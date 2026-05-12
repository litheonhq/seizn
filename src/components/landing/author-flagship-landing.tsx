import type { Locale } from "@/i18n/config";
import type { SaebyeokDemoData } from "@/lib/sample-ip-demo";
import { type AuthorLandingCopy } from "./author-landing-copy";
import { ProgramTease } from "./program-tease";
import { HeroSplitDetector } from "./hero-split-detector";
import { SectionWorkflow } from "./section-workflow";
import { SectionInputs } from "./section-inputs";
import { SectionConflicts } from "./section-conflicts";
import { SectionSimulation } from "./section-simulation";
import { SectionTrust } from "./section-trust";
import { SectionPricing } from "./section-pricing";
import { SectionTracks } from "./section-tracks";
import { SectionFAQ } from "./section-faq";
import { SectionFooter } from "./section-footer";

export {
  getAuthorLandingCopy,
} from "./author-landing-copy";

export function AuthorFlagshipLanding({
  locale,
  data,
  copy,
  isAuthenticated = false,
}: {
  locale: Locale;
  data: SaebyeokDemoData;
  copy: AuthorLandingCopy;
  isAuthenticated?: boolean;
}) {
  return (
    <div className="author-landing">
      <ProgramTease copy={copy} locale={locale} />
      <HeroSplitDetector copy={copy} locale={locale} isAuthenticated={isAuthenticated} />
      <main>
        <SectionTracks copy={copy} locale={locale} />
        <SectionWorkflow copy={copy} />
        <SectionInputs copy={copy} />
        <SectionConflicts copy={copy} data={data} />
        <SectionSimulation copy={copy} />
        <SectionTrust copy={copy} />
        <SectionPricing copy={copy} locale={locale} />
        <SectionFAQ copy={copy} />
      </main>
      <SectionFooter copy={copy} locale={locale} />
    </div>
  );
}
