import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What PitWall stores and what it does not.",
};

export default function Privacy() {
  return (
    <ProsePage
      tag="Privacy"
      title={
        <>
          <span className="type-voice">Your data,</span> <span className="type-display">kept simple</span>
        </>
      }
    >
      <h2>No accounts, no tracking</h2>
      <p>
        PitWall has no sign-up, no advertising and no analytics or tracking cookies. Nothing you do here is sent to us.
      </p>
      <h2>What stays in your browser</h2>
      <p>
        A few preferences are saved in your browser&apos;s local storage so the site remembers them: the driver you
        follow, whether sound is on, and your podium calls. They never leave your device; clearing your browser data
        removes them.
      </p>
      <h2>Hosting and links</h2>
      <p>
        The site is hosted on Vercel, which keeps standard server logs. Official highlights open on YouTube and photo
        credits link to Wikimedia Commons; those sites have their own privacy policies.
      </p>
    </ProsePage>
  );
}
