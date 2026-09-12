// Game clock. 10 game minutes per 7 real seconds (Stardew). Day runs 6:00 to 2:00 (collapse).
export const SEASONS = ["spring", "summer", "fall", "winter"];
export const DAYS_PER_SEASON = 28;
const SECS_PER_MINUTE = 0.7;

export const Clock = {
  minutes: 6 * 60, day: 1, season: 0, year: 1,
  acc: 0, paused: false, listeners: [],

  update(dt) {
    if (this.paused) return;
    this.acc += dt;
    while (this.acc >= SECS_PER_MINUTE) {
      this.acc -= SECS_PER_MINUTE;
      this.minutes += 1;
      if (this.minutes % 10 === 0) for (const l of this.listeners) l(this.minutes);
    }
  },

  onTenMinutes(fn) { this.listeners.push(fn); },

  get hour() { return Math.floor(this.minutes / 60); },
  get seasonName() { return SEASONS[this.season]; },
  get isNight() { return this.minutes >= 20 * 60; },
  get pastBedtime() { return this.minutes >= 26 * 60; },

  // fraction of darkness 0..1 for the lighting overlay
  darkness() {
    const m = this.minutes;
    let start = 18 * 60, end = 21 * 60; // dusk window (varies by season)
    if (this.season === 1) { start = 19 * 60; end = 22 * 60; }
    if (this.season === 3) { start = 16 * 60 + 30; end = 19 * 60 + 30; }
    if (m <= start) return 0;
    if (m >= end) return 1;
    return (m - start) / (end - start);
  },

  timeString() {
    let h = this.hour % 24, m = this.minutes % 60;
    const ampm = h >= 12 ? "pm" : "am";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
  },

  dateString() {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return names[(this.day - 1) % 7] + ". " + this.day;
  },

  dayIndex() { return (this.year - 1) * 4 * DAYS_PER_SEASON + this.season * DAYS_PER_SEASON + (this.day - 1); },

  newDay() {
    this.minutes = 6 * 60; this.acc = 0;
    this.day += 1;
    if (this.day > DAYS_PER_SEASON) { this.day = 1; this.season = (this.season + 1) % 4; if (this.season === 0) this.year += 1; }
  },

  save() { return { minutes: this.minutes, day: this.day, season: this.season, year: this.year }; },
  load(d) { if (!d) return; this.minutes = d.minutes; this.day = d.day; this.season = d.season; this.year = d.year; },
};
