// Crisp text on the scaled screen canvas. Coordinates are in native (buffer) pixels.
import { Screen } from "../engine/screen.js";

const FONT = "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif";

export function drawText(str, x, y, opts) {
  opts = opts || {};
  const s = Screen.scale, c = Screen.ctx;
  const size = (opts.size || 7) * s;
  c.font = (opts.bold ? "bold " : "") + size + "px " + FONT;
  c.textAlign = opts.align || "left";
  c.textBaseline = "top";
  const px = Math.round(x * s), py = Math.round(y * s);
  if (opts.shadow !== false) { c.fillStyle = opts.shadowColor || "rgba(0,0,0,0.55)"; c.fillText(str, px + s * 0.6, py + s * 0.6); }
  c.fillStyle = opts.color || "#fff";
  c.fillText(str, px, py);
}

export function measureText(str, size, bold) {
  const s = Screen.scale, c = Screen.ctx;
  c.font = (bold ? "bold " : "") + (size || 7) * s + "px " + FONT;
  return c.measureText(str).width / s;
}

// greedy word wrap into lines that fit `width` native px
export function wrapText(str, width, size, bold) {
  const words = str.split(" "), lines = []; let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (measureText(test, size, bold) > width && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// filled/stroked panel on the screen canvas, native coords
export function drawPanel(x, y, w, h, opts) {
  opts = opts || {};
  const s = Screen.scale, c = Screen.ctx;
  c.fillStyle = opts.fill || "rgba(40,24,12,0.92)";
  c.fillRect(Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s));
  c.lineWidth = s;
  c.strokeStyle = opts.stroke || "#c9955a";
  c.strokeRect(Math.round(x * s) + s / 2, Math.round(y * s) + s / 2, Math.round(w * s) - s, Math.round(h * s) - s);
  if (opts.inner !== false) {
    c.strokeStyle = opts.innerStroke || "rgba(0,0,0,0.5)";
    c.strokeRect(Math.round(x * s) + s * 1.5, Math.round(y * s) + s * 1.5, Math.round(w * s) - s * 3, Math.round(h * s) - s * 3);
  }
}

export function fillRect(x, y, w, h, color) {
  const s = Screen.scale, c = Screen.ctx;
  c.fillStyle = color;
  c.fillRect(Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s));
}

// draw a sprite region from an image onto the screen canvas at native coords
export function drawSprite(img, sx, sy, sw, sh, x, y, w, h) {
  const s = Screen.scale, c = Screen.ctx;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, sx, sy, sw, sh, Math.round(x * s), Math.round(y * s), Math.round((w || sw) * s), Math.round((h || sh) * s));
}
