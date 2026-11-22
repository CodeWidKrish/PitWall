import type { CSSProperties, ReactNode } from "react";

/** One line of a headline that slides up out of a mask when the heading scrolls in. */
export function Line({ children, i = 0 }: { children: ReactNode; i?: number }) {
  return (
    <span className="reveal-line">
      <span style={{ "--i": i } as CSSProperties}>{children}</span>
    </span>
  );
}

/** Section heading: tag, two-line headline and a short lede. */
export function SectionHead({
  tag,
  lines,
  lede,
  id,
}: {
  tag: string;
  lines: ReactNode[];
  lede?: ReactNode;
  id?: string;
}) {
  return (
    <div className="sechead">
      <div>
        <span className="tag mb-6">{tag}</span>
        <h2 id={id} className="h2" data-reveal="lines">
          {lines.map((l, i) => (
            <Line key={i} i={i}>
              {l}
            </Line>
          ))}
        </h2>
      </div>
      {lede ? (
        <p className="lede" data-reveal="fade" style={{ "--i": 2 } as CSSProperties}>
          {lede}
        </p>
      ) : null}
    </div>
  );
}

export const D = ({ children }: { children: ReactNode }) => <span className="type-display">{children}</span>;
export const V = ({ children }: { children: ReactNode }) => <span className="type-voice">{children}</span>;
