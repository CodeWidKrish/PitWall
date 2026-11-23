import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/** Layout for text pages: header, a big title, readable column, footer. */
export function ProsePage({ tag, title, children }: { tag: string; title: ReactNode; children: ReactNode }) {
  return (
    <>
      <SiteHeader home={false} />
      <main id="main" className="theme-day flex-1 pb-28 pt-40">
        <div className="wrap">
          <span className="tag">{tag}</span>
          <h1 className="h2 mt-6">{title}</h1>
          <div className="prose-pw mt-12 grid max-w-[68ch] gap-5 text-[17px] leading-relaxed text-sub">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
