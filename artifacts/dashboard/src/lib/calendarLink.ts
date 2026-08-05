/**
 * Google Calendar deep link (no OAuth). Opens add-event UI with title + time.
 */
export function googleCalendarFollowupUrl(params: {
  title: string;
  scheduledAt: string;
  details?: string;
  durationMinutes?: number;
}): string {
  const start = new Date(params.scheduledAt);
  const end = new Date(
    start.getTime() + (params.durationMinutes ?? 15) * 60_000,
  );
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  if (params.details) q.set("details", params.details);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}