import {useCallback, useEffect, useState} from "react";

const JAPAN_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

/** Japan has no daylight-saving offset, so calendar boundaries stay at UTC+9. */
export function businessDateAt(now = Date.now()): string {
  return new Date(now + JAPAN_OFFSET_MS).toISOString().slice(0, 10);
}

export function millisecondsUntilBusinessMidnight(now = Date.now()): number {
  const shifted = now + JAPAN_OFFSET_MS;
  // The small margin keeps early timer delivery from reusing yesterday's date.
  return Math.floor(shifted / DAY_MS) * DAY_MS + DAY_MS - shifted + 100;
}

export type BusinessPeriod = {
  today: string;
  currentMonth: string;
  month: string;
  followingCurrentMonth: boolean;
  selectMonth: (month: string) => void;
  followCurrentMonth: () => void;
};

/** Display dates advance independently of spreadsheet reads or form drafts. */
export function useBusinessPeriod(): BusinessPeriod {
  const [today, setToday] = useState(() => businessDateAt());
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const updateClock = () => {
      if (!mounted) return;
      const now = Date.now();
      setToday(businessDateAt(now));
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(updateClock, millisecondsUntilBusinessMidnight(now));
    };
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") updateClock();
    };
    window.addEventListener("focus", updateClock);
    window.addEventListener("pageshow", updateClock);
    document.addEventListener("visibilitychange", onVisibility);
    // A tab restored after midnight may mount with a pre-midnight render.
    updateClock();
    return () => {
      mounted = false;
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("focus", updateClock);
      window.removeEventListener("pageshow", updateClock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const selectMonth = useCallback((month: string) => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month.slice(0, 4) !== "0000") {
      setSelectedMonth(month);
    }
  }, []);
  const followCurrentMonth = useCallback(() => {
    setToday(businessDateAt());
    setSelectedMonth(null);
  }, []);

  const currentMonth = today.slice(0, 7);
  return {today, currentMonth, month: selectedMonth ?? currentMonth, followingCurrentMonth: selectedMonth === null, selectMonth, followCurrentMonth};
}
