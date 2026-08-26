import { getTimeZones } from "@vvo/tzdb";

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absoluteMinutes = Math.abs(minutes);
  const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, "0");
  const remainder = (absoluteMinutes % 60).toString().padStart(2, "0");
  return `UTC${sign}${hours}:${remainder}`;
}

export const TIMEZONES = getTimeZones({ includeUtc: true }).map((timezone) => ({
  value: timezone.name,
  label: `${formatOffset(timezone.currentTimeOffsetInMinutes)} · ${timezone.alternativeName} · ${timezone.mainCities.join(", ")} — ${timezone.name}`,
}));
