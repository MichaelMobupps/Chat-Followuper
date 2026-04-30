import type { StageTiming } from "@workspace/db";

export interface ScheduleWindow {
  min_days: number;
  max_days: number;
  hour_start: number;
  hour_end: number;
  sendDays: number[];
}

export interface UserTimingSettings {
  stageTiming: StageTiming[];
  sendDays: number[];
  sendHourStart: number;
  sendHourEnd: number;
}

const DEFAULT_SEND_DAYS = [1, 2, 3, 4, 5];

const DEFAULT_STAGE_DEFAULTS: { min: number; max: number }[] = [
  { min: 3, max: 7 },
  { min: 10, max: 14 },
  { min: 21, max: 28 },
  { min: 35, max: 42 },
  { min: 49, max: 56 },
  { min: 63, max: 70 },
  { min: 77, max: 84 },
  { min: 90, max: 98 },
  { min: 105, max: 112 },
  { min: 120, max: 126 },
];

function findNextAllowedDay(date: Date, sendDays: number[]): Date {
  if (sendDays.length === 0) return date;
  const result = new Date(date);
  let attempts = 0;
  while (!sendDays.includes(result.getDay()) && attempts < 7) {
    result.setDate(result.getDate() + 1);
    attempts++;
  }
  return result;
}

export function generateScheduledTime(
  window: ScheduleWindow,
  fromDate?: Date,
): string {
  const now = fromDate || new Date();

  const dayOffset =
    window.min_days +
    Math.floor(Math.random() * (window.max_days - window.min_days + 1));

  const hour =
    window.hour_start +
    Math.floor(Math.random() * (window.hour_end - window.hour_start));

  const minute = Math.floor(Math.random() * 46);

  const scheduled = new Date(now);
  scheduled.setDate(scheduled.getDate() + dayOffset);
  scheduled.setHours(hour, minute, 0, 0);

  const adjusted = findNextAllowedDay(scheduled, window.sendDays);
  adjusted.setHours(hour, minute, 0, 0);

  return adjusted.toISOString();
}

export function getScheduleWindow(stage: number, userSettings?: UserTimingSettings): ScheduleWindow {
  const stageIndex = stage - 1;

  if (userSettings && userSettings.stageTiming && stageIndex < userSettings.stageTiming.length) {
    const timing = userSettings.stageTiming[stageIndex];
    return {
      min_days: timing.minDays,
      max_days: timing.maxDays,
      hour_start: userSettings.sendHourStart,
      hour_end: userSettings.sendHourEnd,
      sendDays: userSettings.sendDays || DEFAULT_SEND_DAYS,
    };
  }

  const d = DEFAULT_STAGE_DEFAULTS[stageIndex] || { min: 7 * (stageIndex + 1), max: 7 * (stageIndex + 1) + 7 };

  return {
    min_days: parseInt(process.env[`FOLLOWUP_${stage}_MIN_DAYS`] || String(d.min)),
    max_days: parseInt(process.env[`FOLLOWUP_${stage}_MAX_DAYS`] || String(d.max)),
    hour_start: parseInt(process.env.SEND_HOUR_START || "8"),
    hour_end: parseInt(process.env.SEND_HOUR_END || "18"),
    sendDays: DEFAULT_SEND_DAYS,
  };
}

export function generateBatchSchedule(
  prospectIds: number[],
  stage: number,
  userSettings?: UserTimingSettings,
): Map<number, string> {
  const window = getScheduleWindow(stage, userSettings);
  const schedule = new Map<number, string>();
  const usedMinutes = new Set<string>();

  for (const pid of prospectIds) {
    let attempts = 0;
    let time: string;

    do {
      time = generateScheduledTime(window);
      attempts++;
    } while (usedMinutes.has(time.slice(0, 16)) && attempts < 50);

    usedMinutes.add(time.slice(0, 16));
    schedule.set(pid, time);
  }

  return schedule;
}
