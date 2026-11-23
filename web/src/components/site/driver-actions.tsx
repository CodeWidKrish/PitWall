"use client";

import { useFollow } from "@/components/follow";
import { openAsk } from "@/components/site/ask-pit-wall";
import { toast } from "@/components/ui/toaster";

/** Follow, ask about, and share one driver. */
export function DriverActions({ id, name, last }: { id: string; name: string; last: string }) {
  const { followId, setFollow } = useFollow();
  const following = followId === id;

  const share = async () => {
    const url = location.href;
    const text = `${name} on PitWall: odds, form and the model's record.`;
    try {
      if (navigator.share) await navigator.share({ title: `${name} · PitWall`, text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", body: "Paste it anywhere: it comes with a preview card." });
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => !following && setFollow(id)}
        aria-pressed={following}
        className={`btn ${following ? "btn-line" : "btn-primary"}`}
      >
        <span className="lbl">
          <i>{following ? `Following ${last}` : `Follow ${last}`}</i>
          <i>{following ? `Following ${last}` : `Follow ${last}`}</i>
        </span>
        {!following ? <span className="dot" /> : null}
      </button>
      <button type="button" onClick={() => openAsk(`Tell me about ${name}'s chances in the next race.`)} className="btn btn-line">
        <span className="lbl">
          <i>Ask about {last}</i>
          <i>Ask about {last}</i>
        </span>
      </button>
      <button
        type="button"
        onClick={share}
        aria-label={`Share ${name}'s page`}
        className="grid size-12 place-items-center rounded-full border border-current transition-transform duration-500 ease-expo hover:-translate-y-0.5"
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
          <path d="M8 10V2M4.5 5.5 8 2l3.5 3.5M3 9v4.5h10V9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}
