// @ts-check

/**
 * Where services get the time. Tests pass a fixed clock instead of `systemClock`.
 * @typedef {object} Clock
 * @property {() => number} now
 * @property {(now: number) => number} startOfDay The first millisecond of the day containing `now`.
 * @property {(now: number) => number} endOfDay The last millisecond of the day containing `now`.
 */

/**
 * The device clock, with days in the local time zone.
 * @type {Clock}
 */
export const systemClock = {
  now: () => Date.now(),
  startOfDay(now) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  },
  endOfDay(now) {
    const date = new Date(now);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  },
};
