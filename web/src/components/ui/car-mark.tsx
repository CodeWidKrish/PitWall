import { useId } from "react";

/**
 * A side-on modern F1 car, drawn for PitWall to real proportions (about 5.6 m long on
 * 0.72 m wheels): livery in the followed driver's team colour (--you), carbon floor and
 * wings, airbox, halo, helmet, a light catching the top edge, and tyre bands. The wheels
 * carry spokes so the parent can spin them (`.car-mark .spin`).
 */
export function CarMark({ className = "", title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const body = `cm-body-${id}`,
    tyre = `cm-tyre-${id}`,
    sheen = `cm-sheen-${id}`;
  const wheels = [
    { cx: 25, r: 7.6 },
    { cx: 99, r: 7.2 },
  ];
  return (
    <svg viewBox="0 0 128 42" className={`car-mark ${className}`} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="color-mix(in oklab, var(--you) 70%, white)" />
          <stop offset="0.45" stopColor="var(--you)" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--you) 55%, black)" />
        </linearGradient>
        <radialGradient id={tyre} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stopColor="#30333a" />
          <stop offset="0.8" stopColor="#16171a" />
          <stop offset="1" stopColor="#060607" />
        </radialGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* shadow on the track */}
      <ellipse cx="64" cy="39.6" rx="57" ry="1.8" fill="#000" opacity="0.55" />

      {/* rear wing: endplate, mainplane and DRS flap */}
      <path d="M3.5 9h3.2l1.2 20.5H4.6Z" fill="#141518" />
      <path d="M3.5 9.2h17.2l-.6 2.6H3.9Z" fill={`url(#${body})`} />
      <path d="M4.4 13.4h15.2l-.5 1.7H4.6Z" fill="#1d1f24" />
      <path d="M10.5 15.1v12" stroke="#1d1f24" strokeWidth="1.2" />

      {/* floor and diffuser */}
      <path d="M8 31.2h110l2.4 1.7H9.4Z" fill="#101114" />

      {/* chassis: engine cover up to the airbox, cockpit, then the long nose */}
      <path
        d="M9.5 31.2 12 25.6c1.4-2 3.6-3 6.4-3.3l15.6-1.7 8.4-7.4c.9-.8 2-1.2 3.2-1.2h4.6c1.4 0 2.4.8 2.8 2l1.6 5h9.6c2.8 0 4.6.4 6.6 1l30.8 7.8c4.8 1.2 8.6 2.6 12 4.4l-1.3 1.4H9.5Z"
        fill={`url(#${body})`}
      />
      {/* sidepod undercut shadow and inlet */}
      <path d="M33 29.8c8-3.6 18-4.4 33-3.4" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M53.5 21.6h7.6" stroke="#0b0c0e" strokeWidth="1.8" strokeLinecap="round" />
      {/* airbox intake */}
      <path d="M44.6 13.4h4.2l.6 2.4h-5.3Z" fill="#0b0c0e" />
      {/* light catching the top edge */}
      <path d="M14 23.4c6-1.4 13-1.9 20.4-2.6l8.6-7.2M66 21c12 1.6 26 5.2 40 8.6" fill="none" stroke={`url(#${sheen})`} strokeWidth="0.9" strokeLinecap="round" />

      {/* driver: helmet with visor stripe, under the halo */}
      <circle cx="58.6" cy="17.6" r="2.5" fill="#e9eaec" />
      <path d="M58.8 17h2.2" stroke="#0b0c0e" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M56.2 16.4c.8-.9 1.8-1.4 3-1.4" stroke="var(--you)" strokeWidth="0.8" strokeLinecap="round" fill="none" />
      <path d="M53.8 20c1.6-3.6 4.6-5.4 8.8-5.2 2.4.1 4 1.3 5 3.4" fill="none" stroke="#0e0f12" strokeWidth="1.3" strokeLinecap="round" />

      {/* front wing with endplate */}
      <path d="M104 31.4h19.6l1.6 1.8h-21.2Z" fill="#141518" />
      <path d="M107 29.6h15.8" stroke={`url(#${body})`} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M122.6 26.6h2.4l.4 6.6h-2.4Z" fill="#141518" />

      {/* wheels: tyre, coloured sidewall band, rim, spinning spokes, hub */}
      {wheels.map((w) => (
        <g key={w.cx}>
          <circle cx={w.cx} cy={31.6} r={w.r} fill={`url(#${tyre})`} />
          <circle cx={w.cx} cy={31.6} r={w.r * 0.78} fill="none" stroke="var(--you)" strokeOpacity="0.85" strokeWidth="0.55" />
          <circle cx={w.cx} cy={31.6} r={w.r * 0.56} fill="#1a1b1f" stroke="#40444c" strokeWidth="0.5" />
          <g className="spin">
            {[0, 36, 72, 108, 144].map((a) => (
              <path key={a} d={`M${w.cx - w.r * 0.52} 31.6h${w.r * 1.04}`} stroke="#5a5f69" strokeWidth="0.55" transform={`rotate(${a} ${w.cx} 31.6)`} />
            ))}
          </g>
          <circle cx={w.cx} cy={31.6} r={w.r * 0.13} fill="#cfd2d6" />
        </g>
      ))}
    </svg>
  );
}
