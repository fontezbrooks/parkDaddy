// Eastern-time helpers independent of the device zone. ParkEaz prints and
// sells parking in America/New_York wall-clock time; everything here goes
// through Intl so Hermes and Node agree.

const EASTERN_TZ = "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;

export type EasternParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function easternParts(instantMs: number): EasternParts {
  const parts = formatter.formatToParts(new Date(instantMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Some engines print 24 for midnight under h23; normalise.
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

// Offset (UTC minus Eastern wall clock) at a given instant.
export function getEasternOffsetMs(instantMs: number): number {
  const p = easternParts(instantMs);
  const wallAsUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.floor(instantMs / 1000) * 1000 - wallAsUtc;
}

// Converts an Eastern wall-clock time (expressed as if it were UTC) to the
// real instant. Two passes settle the offset across a DST boundary.
export function easternWallClockToMs(wallAsUtcMs: number): number {
  const first = wallAsUtcMs + getEasternOffsetMs(wallAsUtcMs);
  return wallAsUtcMs + getEasternOffsetMs(first);
}

// "h:mm AM/PM" built from parts, not a second Intl call: Hermes is not
// consistent about the AM/PM token.
export function formatEasternClock(instantMs: number): string {
  const { hour, minute } = easternParts(instantMs);
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

// The next instant at `hour`:00:00 Eastern strictly after `fromMs`, found by
// walking the Eastern calendar date so DST nights still land on wall-clock.
export function nextEasternWallClock(fromMs: number, hour: number): number {
  const p = easternParts(fromMs);
  let candidate = easternWallClockToMs(
    Date.UTC(p.year, p.month - 1, p.day, hour),
  );
  let guard = 0;
  while (candidate <= fromMs && guard < 3) {
    const next = easternParts(candidate + DAY_MS);
    candidate = easternWallClockToMs(
      Date.UTC(next.year, next.month - 1, next.day, hour),
    );
    guard += 1;
  }
  return candidate;
}
