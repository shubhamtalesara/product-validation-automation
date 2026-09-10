import { DateTime } from "luxon";

export class InvalidLaunchTimeError extends Error {}

/**
 * Resolves a human-entered (launchDate, launchTime, timezone) triple into an
 * exact UTC instant. Never assumes UTC: the timezone is always required and
 * validated as a real IANA zone.
 */
export function resolveLaunchAt(launchDate: string, launchTime: string, timezone: string): Date {
  if (!launchDate) throw new InvalidLaunchTimeError("Launch date is required");
  if (!timezone) throw new InvalidLaunchTimeError("Timezone is required");

  const time = launchTime && launchTime.trim() !== "" ? launchTime : "00:00";
  const dt = DateTime.fromFormat(`${launchDate} ${time}`, "yyyy-MM-dd HH:mm", { zone: timezone });

  if (!dt.isValid) {
    throw new InvalidLaunchTimeError(
      `Could not parse launch date/time "${launchDate} ${time}" in zone "${timezone}": ${dt.invalidReason}`,
    );
  }
  return dt.toUTC().toJSDate();
}

export function isValidTimezone(timezone: string): boolean {
  return DateTime.local().setZone(timezone).isValid;
}
