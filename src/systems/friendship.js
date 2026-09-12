// Friendship points per NPC (250 per heart, 10 hearts max), daily talk/gift tracking.
export const HEART = 250, MAX_HEARTS = 10;

export const Friendship = {
  data: {},            // id -> {points, talked (dayIndex), talks (count today), gifted (dayIndex), met}
  dayIndex: 0,

  get(id) { if (!this.data[id]) this.data[id] = { points: 0, talkedDay: -1, talks: 0, giftedDay: -1, met: false, given: {} }; return this.data[id]; },
  hearts(id) { return Math.min(MAX_HEARTS, this.get(id).points / HEART); },
  add(id, pts) { const f = this.get(id); f.points = Math.max(0, Math.min(MAX_HEARTS * HEART, f.points + pts)); },

  // talk tracking: returns how many times we've talked today *before* this one, and records it
  talkCount(id, dayIndex) { const f = this.get(id); if (f.talkedDay !== dayIndex) { f.talkedDay = dayIndex; f.talks = 0; } return f.talks; },
  recordTalk(id, dayIndex) { const f = this.get(id); if (f.talkedDay !== dayIndex) { f.talkedDay = dayIndex; f.talks = 0; } f.talks += 1; if (f.talks === 1) this.add(id, 20); f.met = true; },

  canGift(id) { return this.get(id).giftedDay !== this.dayIndex; },
  recordGift(id, itemId, pts, reaction) { const f = this.get(id); f.giftedDay = this.dayIndex; f.given[itemId] = (f.given[itemId] || 0) + 1; if (!f.known) f.known = {}; f.known[itemId] = reaction; this.add(id, pts); },

  save() { return { data: this.data, dayIndex: this.dayIndex }; },
  load(d) { if (d) { this.data = d.data || {}; this.dayIndex = d.dayIndex || 0; } },
};
