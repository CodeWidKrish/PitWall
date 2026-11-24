"use client";

import Lenis from "lenis";
import { useEffect, useRef } from "react";

/**
 * Page-wide motion: smooth scrolling, scroll-in reveals, the scroll progress
 * line and the cursor. All of it switches off for reduced motion or touch.
 */
export function Chrome() {
  const progress = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  // Smooth scroll, and in-page anchors that glide instead of jump.
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Smooth wheel scrolling on laptops; phones and touchpads-as-touch keep native scrolling,
    // which is already smooth and runs off the main thread.
    const touch = matchMedia("(hover: none) and (pointer: coarse)").matches;
    const lenis = reduce || touch ? null : new Lenis({ lerp: 0.12, wheelMultiplier: 1, syncTouch: false });
    (window as unknown as { __lenis?: Lenis | null }).__lenis = lenis;
    let raf = 0;
    // The page height is measured only when it changes, never during a scroll frame:
    // reading it every frame forced a full layout of the page on each one.
    let max = 1;
    const measure = () => {
      max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    let shown = -1;
    const paint = () => {
      const p = Math.min(1, Math.max(0, scrollY / max));
      if (Math.abs(p - shown) < 0.001) return;
      shown = p;
      if (progress.current) progress.current.style.transform = `scaleX(${p})`;
    };
    const frame = (t: number) => {
      lenis?.raf(t);
      raf = requestAnimationFrame(frame);
    };
    if (lenis) raf = requestAnimationFrame(frame);
    addEventListener("scroll", paint, { passive: true });
    paint();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href")!.slice(1);
      const el = id ? document.getElementById(id) : document.body;
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
      else el.scrollIntoView({ behavior: "smooth" });
      history.replaceState(null, "", `#${id}`);
    };
    document.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener("scroll", paint);
      document.removeEventListener("click", onClick);
      lenis?.destroy();
    };
  }, []);

  // Reveal anything marked data-reveal once it scrolls into view.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    const watch = () => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));
    watch();
    // The race overlay and countdowns change the page many times a second: look for new
    // reveal targets at most once a frame, and only when elements were added.
    let queued = 0;
    const mo = new MutationObserver((records) => {
      if (queued || !records.some((r) => r.addedNodes.length)) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        watch();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  // Buttons lean toward the pointer and spring back.
  useEffect(() => {
    if (matchMedia("(hover: none), (pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
    let active: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".btn, [data-magnetic]");
      if (active && active !== el) {
        active.style.transform = "";
        active = null;
      }
      if (!el) return;
      active = el;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.22;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.32;
      el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    };
    const leave = () => {
      if (active) active.style.transform = "";
      active = null;
    };
    addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    return () => {
      removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);

  // Cursor ring that grows into a label over anything with data-cursor.
  useEffect(() => {
    if (matchMedia("(hover: none), (pointer: coarse)").matches) return;
    let x = innerWidth / 2,
      y = innerHeight / 2,
      rx = x,
      ry = y,
      raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      const t = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cursor]");
      ring.current?.classList.toggle("big", !!t);
      if (label.current) label.current.textContent = t?.dataset.cursor ?? "";
    };
    // The ring eases after the pointer and the loop sleeps once it has caught up.
    const loop = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0)`;
      raf = Math.abs(x - rx) + Math.abs(y - ry) > 0.3 ? requestAnimationFrame(loop) : 0;
    };
    const wake = (e: PointerEvent) => {
      move(e);
      if (!raf) raf = requestAnimationFrame(loop);
    };
    addEventListener("pointermove", wake);
    return () => {
      removeEventListener("pointermove", wake);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div
        ref={progress}
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-[70] h-0.5 origin-left scale-x-0 bg-you"
      />
      <div ref={ring} className="cursor" aria-hidden="true">
        <span ref={label} />
      </div>
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
    </>
  );
}
