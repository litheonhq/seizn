import { Footer } from "./_components/footer";
import { Hero } from "./_components/hero";
import { NavBar } from "./_components/nav-bar";
import { PlaygroundSection } from "./_components/playground-section";
import { RuntimeRow } from "./_components/runtime-row";
import { SDKBlock } from "./_components/sdk-block";
import { Wedges } from "./_components/wedge-cards";

export default function EngineLandingPage() {
  return (
    <>
      <NavBar />
      <main>
        <Hero />
        <PlaygroundSection />
        <RuntimeRow />
        <Wedges />
        <SDKBlock />
      </main>
      <Footer />
    </>
  );
}
