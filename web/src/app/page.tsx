import { BuildLog } from "@/components/site/build-log";
import { FeatureGrid } from "@/components/site/feature-grid";
import { Hero } from "@/components/site/hero";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
        <BuildLog />
      </main>
      <SiteFooter />
    </>
  );
}
