type DailyPresenceSummaryRow = {
  checkInTime?: Date | null;
  checkOutTime?: Date | null;
};

export type DailyPresenceSummary = {
  checkInRecorded: number;
  checkOutRecorded: number;
  openPresence: number;
  averageCheckInTime: string | null;
  averageCheckOutTime: string | null;
};

const EMPTY_DAILY_PRESENCE_SUMMARY: DailyPresenceSummary = {
  checkInRecorded: 0,
  checkOutRecorded: 0,
  openPresence: 0,
  averageCheckInTime: null,
  averageCheckOutTime: null,
};

const jakartaMinuteFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const outputTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
});

function toJakartaMinutes(value?: Date | null): number | null {
  if (!value) return null;
  const parts = jakartaMinuteFormatter.formatToParts(value);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function formatAverageMinutes(totalMinutes: number, count: number): string | null {
  if (!Number.isFinite(totalMinutes) || !Number.isFinite(count) || count <= 0) return null;
  const rounded = Math.round(totalMinutes / count);
  const hours = Math.floor(rounded / 60) % 24;
  const minutes = rounded % 60;
  return outputTimeFormatter.format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

export function summarizeDailyPresenceRows(rows: DailyPresenceSummaryRow[]): DailyPresenceSummary {
  if (!Array.isArray(rows) || rows.length === 0) return { ...EMPTY_DAILY_PRESENCE_SUMMARY };

  let checkInRecorded = 0;
  let checkOutRecorded = 0;
  let openPresence = 0;
  let totalCheckInMinutes = 0;
  let totalCheckOutMinutes = 0;

  rows.forEach((row) => {
    const checkInMinutes = toJakartaMinutes(row.checkInTime);
    const checkOutMinutes = toJakartaMinutes(row.checkOutTime);

    if (checkInMinutes !== null) {
      checkInRecorded += 1;
      totalCheckInMinutes += checkInMinutes;
      if (!row.checkOutTime) {
        openPresence += 1;
      }
    }

    if (checkOutMinutes !== null) {
      checkOutRecorded += 1;
      totalCheckOutMinutes += checkOutMinutes;
    }
  });

  return {
    checkInRecorded,
    checkOutRecorded,
    openPresence,
    averageCheckInTime: formatAverageMinutes(totalCheckInMinutes, checkInRecorded),
    averageCheckOutTime: formatAverageMinutes(totalCheckOutMinutes, checkOutRecorded),
  };
}
