"use client";

/** Downloads a calendar entry for a race start (UTC), two hours long. */
export function AddToCalendar({ title, startUtc, location }: { title: string; startUtc: string; location: string }) {
  const save = () => {
    const start = new Date(startUtc);
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PitWall//Race//EN",
      "BEGIN:VEVENT",
      `UID:${fmt(start)}-pitwall@race`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${title}`,
      `LOCATION:${location}`,
      `DESCRIPTION:Race odds and your podium call: ${window.location.origin}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${title} starts in 30 minutes`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button type="button" onClick={save} className="btn btn-line" data-cursor="Save">
      <span className="lbl">
        <i>Add to calendar</i>
        <i>Add to calendar</i>
      </span>
    </button>
  );
}
