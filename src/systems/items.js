// Item definitions (data/items.json) and icon drawing.
// def: { name, type: seed|crop|material|tool|food|misc, sell, buy, desc, icon, crop (for seeds),
//        tool (hoe|can|axe|pickaxe|scythe), edible (energy) }
// icon: a number = index into the vanilla springobjects sheet (24 columns of 16px),
//       or { sheet, sx, sy } for an explicit region of any loaded image.
import { Assets } from "../engine/assets.js";
import { Screen } from "../engine/screen.js";

export const Items = {
  defs: {},
  init(data) { this.defs = data; },
  get(id) { return this.defs[id] || null; },
  name(id) { const d = this.defs[id]; return d ? d.name : id; },
  isTool(id) { const d = this.defs[id]; return !!(d && d.type === "tool"); },
  stackable(id) { const d = this.defs[id]; return !(d && d.type === "tool"); },

  iconSource(id) {
    const d = this.defs[id];
    if (!d || d.icon === undefined) return null;
    if (typeof d.icon === "number") {
      const img = Assets.img.springobjects; if (!img) return null;
      return { img: img, sx: (d.icon % 24) * 16, sy: Math.floor(d.icon / 24) * 16, w: 16, h: 16 };
    }
    const img = Assets.img[d.icon.sheet]; if (!img) return null;
    return { img: img, sx: d.icon.sx, sy: d.icon.sy, w: d.icon.w || 16, h: d.icon.h || 16 };
  },

  // draw on a native-resolution context (world)
  drawIcon(ctx, id, x, y) {
    const s = this.iconSource(id); if (!s) return;
    ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, Math.round(x), Math.round(y), s.w, s.h);
  },

  // draw on the scaled screen canvas at native coords
  drawIconUI(id, x, y, size) {
    const s = this.iconSource(id);
    const sc = Screen.scale, c = Screen.ctx;
    size = size || 16;
    if (!s) { c.fillStyle = "#a55"; c.fillRect(x * sc, y * sc, size * sc, size * sc); return; }
    c.imageSmoothingEnabled = false;
    // fit the icon in the box without stretching (tool icons are taller than wide)
    const k = Math.min(size / s.w, size / s.h), dw = s.w * k, dh = s.h * k;
    c.drawImage(s.img, s.sx, s.sy, s.w, s.h, Math.round((x + (size - dw) / 2) * sc), Math.round((y + (size - dh) / 2) * sc), Math.round(dw * sc), Math.round(dh * sc));
  },
};
