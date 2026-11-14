const clock = new Intl.DateTimeFormat("ar-EG", {
  hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
});

export function formatClock(time: string | number) {
  const minutes = typeof time === "number" ? time : Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return clock.format(minutes * 60_000);
}
