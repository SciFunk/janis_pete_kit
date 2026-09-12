// Shop menu: buy list on the left (seeds in season + stock), your inventory on the right to sell.
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { drawText, drawPanel, fillRect } from "./text.js";
import { Items } from "../systems/items.js";
import { Farming } from "../systems/farming.js";
import { Clock } from "../systems/time.js";
import { drawSlot, SLOT, PAD } from "./hotbar.js";
import { ROW } from "../systems/inventory.js";
import { Settings } from "../systems/settings.js";
import { Confirm } from "./settings.js";

export const Shop = {
  world: null, isOpen: false, stock: [], scroll: 0, hover: -1, hoverInv: -1, kind: "general",
  init(world) { this.world = world; world.hooks.update.push(() => { if (this.isOpen) this.update(); }); },

  buildStock(kind) {
    const list = [];
    if (kind === "general") {
      for (const cid in Farming.crops) {
        const c = Farming.crops[cid], seed = Items.get(c.seed);
        if (!seed || !seed.buy) continue;
        if (c.seasons.indexOf(Clock.seasonName) < 0) continue;
        list.push({ id: c.seed, price: seed.buy });
      }
      list.sort((a, b) => a.price - b.price);
      list.push({ id: "bread", price: Items.get("bread").buy });
    } else if (kind === "bakery") {
      for (const id of ["bread", "cookie", "pancakes", "blueberry_tart", "rhubarb_pie", "wheat_flour", "sugar"]) { const d = Items.get(id); if (d && d.buy) list.push({ id: id, price: d.buy }); }
    } else if (kind === "curios") {
      const rare = { starfruit_seeds: 400, ancient_fruit_seeds: 1200, coffee_seeds: 250, fairy_rose_seeds: 200, sunflower_seeds: 200, rice_seeds: 60 };
      for (const id in rare) if (Items.get(id)) list.push({ id: id, price: rare[id] });
    }
    return list;
  },

  open(kind) { this.kind = kind || "general"; this.stock = this.buildStock(this.kind); this.isOpen = true; this.justOpened = true; this.scroll = 0; this.skipConfirm = false; this.world.locks++; },
  // run `act` now, or after a yes/no question (Settings decide per store; "don't ask again" lasts this visit)
  ask(text, act) { if (this.skipConfirm || !Settings.shouldConfirm(this.kind)) act(); else Confirm.ask(text, act, { owner: this }); },
  close() { this.isOpen = false; this.world.locks--; },

  rect() { const w = Math.min(Screen.vw - 8, 330), h = Math.min(Screen.vh - 8, 200); return { x: Math.floor((Screen.vw - w) / 2), y: Math.floor((Screen.vh - h) / 2), w: w, h: h }; },
  rowsVisible() { return Math.floor((this.rect().h - 40) / 18); },

  invPos(i) { const r = this.rect(); const x0 = r.x + r.w - (6 * (SLOT + PAD)) - 8; return [x0 + (i % 6) * (SLOT + PAD), r.y + 30 + Math.floor(i / 6) * (SLOT + PAD)]; },

  update() {
    if (this.justOpened) { this.justOpened = false; return; }
    if (Confirm.update()) return;
    if (Input.justPressed("Escape", "KeyE", "Tab", "Space")) { this.close(); return; }
    const m = Input.mouse, r = this.rect(), p = this.world.player, inv = p.inventory;
    if (m.wheel) this.scroll = Math.max(0, Math.min(Math.max(0, this.stock.length - this.rowsVisible()), this.scroll + m.wheel));
    this.hover = -1; this.hoverInv = -1;
    const listW = r.w - (6 * (SLOT + PAD)) - 24;
    for (let i = 0; i < this.rowsVisible(); i++) {
      const idx = i + this.scroll; if (idx >= this.stock.length) break;
      const y = r.y + 30 + i * 18;
      if (m.x >= r.x + 6 && m.x < r.x + 6 + listW && m.y >= y && m.y < y + 18) this.hover = idx;
    }
    for (let i = 0; i < inv.slots.length; i++) {
      const [x, y] = this.invPos(i);
      if (m.x >= x && m.x < x + SLOT && m.y >= y && m.y < y + SLOT) this.hoverInv = i;
    }
    if ((m.pressed || m.rpressed) && this.hover >= 0) {
      const s = this.stock[this.hover];
      const n = m.rpressed ? 5 : 1;
      const cost = s.price * n;
      if (p.gold < cost) { this.world.toast("Not enough gold"); return; }
      if (!inv.canAdd(s.id, n)) { this.world.toast("Inventory full"); return; }
      this.ask("Buy " + Items.name(s.id) + (n > 1 ? " x" + n : "") + " for " + cost + "g?", () => {
        if (p.gold < cost || !inv.canAdd(s.id, n)) return;
        p.gold -= cost; inv.add(s.id, n); this.world.toast("Bought " + Items.name(s.id) + (n > 1 ? " x" + n : ""), s.id);
      });
    }
    if ((m.pressed || m.rpressed) && this.hoverInv >= 0) {
      const s = inv.slots[this.hoverInv]; if (!s) return;
      const d = Items.get(s.id);
      if (!d || !d.sell || d.type === "tool") { this.world.toast("Can't sell that"); return; }
      const n = m.rpressed ? 1 : s.n, slot = this.hoverInv;
      this.ask("Sell " + Items.name(s.id) + " x" + n + " for " + d.sell * n + "g?", () => {
        const cur = inv.slots[slot]; if (!cur || cur.id !== s.id) return;
        const t = inv.take(slot, Math.min(n, cur.n));
        p.gold += d.sell * t.n; this.world.toast("Sold " + Items.name(t.id) + " x" + t.n + " for " + d.sell * t.n + "g");
      });
    }
  },

  draw() {
    if (!this.isOpen) return;
    const r = this.rect(), p = this.world.player, inv = p.inventory;
    fillRect(0, 0, Screen.vw, Screen.vh, "rgba(0,0,0,0.45)");
    drawPanel(r.x, r.y, r.w, r.h);
    drawText({ general: "Fresh Finds", bakery: "Sabine's Bakery", curios: "The Gilded Nest" }[this.kind] || "Shop", r.x + 8, r.y + 6, { size: 8, bold: true, color: "#f4e4c1" });
    drawText(p.gold + "g", r.x + r.w - 8, r.y + 7, { size: 8, bold: true, align: "right", color: "#ffd86b" });
    drawText("Buy (click; right-click x5)", r.x + 8, r.y + 18, { size: 5.5, color: "#c9b48a" });
    const listW = r.w - (6 * (SLOT + PAD)) - 24;
    for (let i = 0; i < this.rowsVisible(); i++) {
      const idx = i + this.scroll; if (idx >= this.stock.length) break;
      const s = this.stock[idx], y = r.y + 30 + i * 18;
      if (idx === this.hover) fillRect(r.x + 6, y, listW, 18, "rgba(255,220,120,0.2)");
      Items.drawIconUI(s.id, r.x + 8, y + 1, 16);
      drawText(Items.name(s.id), r.x + 28, y + 4, { size: 6.5, color: p.gold >= s.price ? "#fff" : "#a08a7a" });
      drawText(s.price + "g", r.x + 6 + listW - 4, y + 4, { size: 6.5, align: "right", color: "#ffd86b" });
    }
    if (this.stock.length > this.rowsVisible()) drawText("scroll for more", r.x + 8, r.y + r.h - 12, { size: 5, color: "#c9b48a" });
    // sell side
    const sx = this.invPos(0)[0];
    drawText("Sell (click; right-click x1)", sx, r.y + 18, { size: 5.5, color: "#c9b48a" });
    for (let i = 0; i < inv.slots.length; i++) {
      const [x, y] = this.invPos(i);
      drawSlot(x, y, inv.slots[i], false);
      if (i === this.hoverInv) fillRect(x, y, SLOT, SLOT, "rgba(255,255,255,0.18)");
    }
    if (this.hoverInv >= 0 && inv.slots[this.hoverInv]) {
      const s = inv.slots[this.hoverInv], d = Items.get(s.id);
      drawText(Items.name(s.id) + (d && d.sell ? "  " + d.sell + "g each" : "  (can't sell)"), sx, r.y + r.h - 12, { size: 6, color: "#fff" });
    } else if (this.hover >= 0) {
      const d = Items.get(this.stock[this.hover].id);
      if (d && d.desc) drawText(d.desc, r.x + 8, r.y + r.h - 12, { size: 5.5, color: "#e8dcc8" });
    }
    Confirm.draw();
  },
};
