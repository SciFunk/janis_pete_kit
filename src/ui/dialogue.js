// Dialogue box: pages of text with a typewriter, optional speaker name, optional choices at the end.
// Markup: "#$b#" or "\n\n" = page break; "@" = player name; "$h/$s/$l/$a/$u/$e" emotion/end codes stripped.
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { drawText, drawPanel, fillRect, wrapText } from "./text.js";

export const Dialogue = {
  active: null, // {pages:[string], page, shown, speaker, choices, sel, cb, portrait}
  speed: 45,    // chars per second

  parse(text, playerName) {
    let t = String(text).replace(/@/g, playerName || "you");
    t = t.replace(/\$[hslaue]\b/g, "").replace(/\$\d+/g, "");
    return t.split(/#\$b#|\n\n/).map((p) => p.trim()).filter((p) => p.length);
  },

  say(text, opts) {
    opts = opts || {};
    const pages = this.parse(text, opts.playerName);
    if (!pages.length) pages.push("...");
    this.active = { pages: pages, page: 0, shown: 0, speaker: opts.speaker || null, choices: opts.choices || null, sel: 0, cb: opts.cb || null, portrait: opts.portrait || null, t: 0 };
  },

  get open() { return !!this.active; },

  update(dt) {
    const a = this.active; if (!a) return;
    const full = a.pages[a.page].length;
    a.shown = Math.min(full, a.shown + this.speed * dt);
    const advance = Input.justPressed("Space", "Enter", "KeyE") || Input.mouse.pressed;
    const last = a.page === a.pages.length - 1;
    if (last && a.choices) {
      if (a.shown < full) { if (advance) a.shown = full; return; }
      if (Input.justPressed("ArrowUp", "KeyW")) a.sel = (a.sel + a.choices.length - 1) % a.choices.length;
      if (Input.justPressed("ArrowDown", "KeyS")) a.sel = (a.sel + 1) % a.choices.length;
      const r = this.rect(); const m = Input.mouse;
      for (let i = 0; i < a.choices.length; i++) {
        const oy = r.y + r.h - 6 - (a.choices.length - i) * 11;
        if (m.x >= r.x && m.x < r.x + r.w && m.y >= oy && m.y < oy + 11) { a.sel = i; if (m.pressed) { this.close(a.sel); return; } }
      }
      if (Input.justPressed("Space", "Enter", "KeyE")) this.close(a.sel);
      return;
    }
    if (advance) {
      if (a.shown < full) a.shown = full;
      else if (!last) { a.page++; a.shown = 0; }
      else this.close(-1);
    }
  },

  close(choice) { const a = this.active; this.active = null; if (a && a.cb) a.cb(choice); },

  rect() {
    const w = Math.min(300, Screen.vw - 20), h = 56 + (this.active && this.active.choices ? this.active.choices.length * 11 : 0);
    return { x: Math.floor((Screen.vw - w) / 2), y: Screen.vh - h - 30, w: w, h: h };
  },

  draw() {
    const a = this.active; if (!a) return;
    const r = this.rect();
    drawPanel(r.x, r.y, r.w, r.h, { fill: "rgba(44,26,14,0.95)" });
    let tx = r.x + 10, tw = r.w - 20;
    if (a.portrait) { a.portrait(r.x + 6, r.y + 6); tx += 40; tw -= 40; }
    let y = r.y + 8;
    if (a.speaker) { drawText(a.speaker, tx, y - 2, { size: 6.5, bold: true, color: "#ffd86b" }); y += 9; }
    const text = a.pages[a.page].slice(0, Math.floor(a.shown));
    const lines = wrapText(text, tw, 7);
    lines.slice(0, 4).forEach((l, i) => drawText(l, tx, y + i * 10, { size: 7, color: "#fff" }));
    const last = a.page === a.pages.length - 1;
    if (a.shown >= a.pages[a.page].length) {
      if (last && a.choices) {
        a.choices.forEach((c, i) => {
          const oy = r.y + r.h - 6 - (a.choices.length - i) * 11;
          if (i === a.sel) fillRect(r.x + 6, oy, r.w - 12, 11, "rgba(255,220,120,0.25)");
          drawText((i === a.sel ? "> " : "  ") + c, r.x + 12, oy + 2, { size: 7, color: i === a.sel ? "#ffe9a8" : "#e8dcc8" });
        });
      } else {
        const blink = Math.floor(performance.now() / 400) % 2 === 0;
        if (blink) drawText(last ? "x" : "v", r.x + r.w - 12, r.y + r.h - 12, { size: 7, color: "#ffd86b", bold: true });
      }
    }
  },
};
