// Slot-based inventory. Slot = {id, n} or null. First ROW slots are the hotbar.
import { Items } from "./items.js";

export const ROW = 12;
export const MAX_STACK = 999;

export class Inventory {
  constructor(size) {
    this.slots = new Array(size || 36).fill(null);
    this.selected = 0;
  }

  get selectedSlot() { return this.slots[this.selected]; }
  get selectedId() { const s = this.slots[this.selected]; return s ? s.id : null; }

  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.n; return n; }
  has(id, n) { return this.count(id) >= (n || 1); }

  // add n of id; returns how many did NOT fit
  add(id, n) {
    n = n === undefined ? 1 : n;
    if (Items.stackable(id)) {
      for (const s of this.slots) {
        if (s && s.id === id && s.n < MAX_STACK) { const take = Math.min(n, MAX_STACK - s.n); s.n += take; n -= take; if (!n) return 0; }
      }
    }
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      if (!this.slots[i]) { const take = Items.stackable(id) ? Math.min(n, MAX_STACK) : 1; this.slots[i] = { id: id, n: take }; n -= take; }
    }
    return n;
  }

  canAdd(id, n) {
    n = n === undefined ? 1 : n;
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += Items.stackable(id) ? MAX_STACK : 1;
      else if (s.id === id && Items.stackable(id)) room += MAX_STACK - s.n;
      if (room >= n) return true;
    }
    return room >= n;
  }

  // remove n of id anywhere; returns true if it had enough
  remove(id, n) {
    n = n === undefined ? 1 : n;
    if (!this.has(id, n)) return false;
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const take = Math.min(n, s.n); s.n -= take; n -= take; if (s.n <= 0) this.slots[i] = null; }
    }
    return true;
  }

  // remove n from a specific slot
  take(i, n) {
    const s = this.slots[i]; if (!s) return null;
    n = n === undefined ? s.n : Math.min(n, s.n);
    const out = { id: s.id, n: n };
    s.n -= n; if (s.n <= 0) this.slots[i] = null;
    return out;
  }

  swap(i, j) { const t = this.slots[i]; this.slots[i] = this.slots[j]; this.slots[j] = t; }

  select(i) { if (i >= 0 && i < ROW) this.selected = i; }
  cycle(d) { this.selected = (this.selected + d + ROW) % ROW; }

  save() { return { slots: this.slots.map((s) => (s ? { id: s.id, n: s.n } : null)), selected: this.selected }; }
  load(d) { if (!d) return; this.slots = d.slots.map((s) => (s ? { id: s.id, n: s.n } : null)); while (this.slots.length < 36) this.slots.push(null); this.selected = d.selected || 0; }
}
