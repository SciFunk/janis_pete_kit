// Title screen: Continue / New game, then a name prompt for a new game.
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { drawText, drawPanel, fillRect } from "./text.js";
import { Assets } from "../engine/assets.js";

export const Title = {
  active: true, mode: "menu", sel: 0, name: "", hasSave: false, onStart: null, t: 0, looks: [], look: 0,

  show(hasSave) { this.active = true; this.hasSave = hasSave; this.mode = "menu"; this.sel = hasSave ? 0 : 1; this.name = ""; },

  options() { return [this.hasSave ? "Continue" : "(no save yet)", "New game", "Try the cave puzzle"]; },

  update(dt) {
    this.t += dt;
    if (this.mode === "menu") {
      const opts = this.options();
      if (Input.justPressed("ArrowUp", "KeyW")) this.sel = (this.sel + opts.length - 1) % opts.length;
      if (Input.justPressed("ArrowDown", "KeyS")) this.sel = (this.sel + 1) % opts.length;
      const m = Input.mouse;
      for (let i = 0; i < opts.length; i++) {
        const oy = Screen.vh / 2 + 10 + i * 16;
        if (m.x > Screen.vw / 2 - 60 && m.x < Screen.vw / 2 + 60 && m.y >= oy && m.y < oy + 14) { this.sel = i; if (m.pressed) this.choose(); }
      }
      if (Input.justPressed("Enter", "Space")) this.choose();
    } else if (this.mode === "name") {
      if (Input.typed) { for (const ch of Input.typed) if (/[A-Za-z0-9 '\-]/.test(ch) && this.name.length < 14) this.name += ch; }
      if (Input.justPressed("Backspace")) this.name = this.name.slice(0, -1);
      if (Input.justPressed("Escape")) { this.mode = "menu"; return; }
      if (Input.justPressed("Enter") && this.name.trim().length) { this.mode = "look"; this.look = 0; }
    } else if (this.mode === "look") {
      const n = this.looks.length;
      if (Input.justPressed("ArrowLeft", "KeyA")) this.look = (this.look + n - 1) % n;
      if (Input.justPressed("ArrowRight", "KeyD")) this.look = (this.look + 1) % n;
      if (Input.justPressed("Escape")) { this.mode = "name"; return; }
      if (Input.justPressed("Enter", "Space")) { this.active = false; this.onStart(false, this.name.trim(), this.looks[this.look]); }
    }
  },

  choose() {
    if (this.sel === 0 && this.hasSave) { this.active = false; this.onStart(true, null); }
    else if (this.sel === 1) { this.mode = "name"; this.name = ""; }
    else if (this.sel === 2) { this.active = false; this.onStart(false, "Explorer", this.looks[0], { puzzle: true }); }
  },

  draw() {
    const vw = Screen.vw, vh = Screen.vh, c = Screen.bctx;
    // backdrop: a slow pan over the loaded outdoors sheet's tree row, tinted
    c.fillStyle = "#1c2a1a"; c.fillRect(0, 0, vw, vh);
    const sheet = Assets.img.outdoors_spring;
    if (sheet) {
      const off = Math.floor(this.t * 6) % 256;
      c.globalAlpha = 0.35;
      for (let x = -off; x < vw; x += 256) c.drawImage(sheet, 0, 0, 256, 96, x, vh - 110, 256, 96);
      c.globalAlpha = 1;
    }
    Screen.present();
    drawText("Valley", vw / 2, vh / 2 - 60, { size: 26, bold: true, align: "center", color: "#f4e4c1" });
    drawText("a small farm, a small town", vw / 2, vh / 2 - 28, { size: 7, align: "center", color: "#c9b48a" });
    if (this.mode === "menu") {
      this.options().forEach((o, i) => {
        const oy = vh / 2 + 10 + i * 16;
        if (i === this.sel) fillRect(vw / 2 - 60, oy, 120, 14, "rgba(255,220,120,0.22)");
        drawText((i === this.sel ? "> " : "") + o, vw / 2, oy + 3, { size: 8, align: "center", color: i === 0 && !this.hasSave ? "#8a7a6a" : "#fff" });
      });
      drawText("Enter to choose", vw / 2, vh - 24, { size: 6, align: "center", color: "#a09080" });
      if (this.sel === 2) drawText("A separate try-out: six animal-herding rooms. Nothing here touches your farm save.", vw / 2, vh / 2 + 62, { size: 5.5, align: "center", color: "#c9b48a" });
    } else if (this.mode === "look") {
      drawPanel(vw / 2 - 90, vh / 2 - 6, 180, 70);
      drawText("Choose your look  (left / right)", vw / 2, vh / 2, { size: 7, align: "center", color: "#f4e4c1" });
      const lk = this.looks[this.look];
      const img = lk && Assets.img[lk.sheet];
      if (img) { const s = Screen.scale, fw = img.width === 64 ? 16 : img.width / 4, fh = img.width === 64 ? 32 : img.height / 4; Screen.ctx.imageSmoothingEnabled = false; Screen.ctx.drawImage(img, 0, 0, fw, fh, (vw / 2 - fw) * s, (vh / 2 + 76 - fh * 2) * s, fw * 2 * s, fh * 2 * s); }
      drawText(lk ? lk.name : "?", vw / 2 + 40, vh / 2 + 30, { size: 7, align: "center", color: "#fff" });
      drawText((this.look + 1) + " / " + this.looks.length, vw / 2 + 40, vh / 2 + 42, { size: 6, align: "center", color: "#c9b48a" });
      drawText("Enter to start   Esc back   (make more in tools/character_builder.html)", vw / 2, vh - 24, { size: 5.5, align: "center", color: "#a09080" });
    } else {
      drawPanel(vw / 2 - 80, vh / 2, 160, 44);
      drawText("What's your name?", vw / 2, vh / 2 + 6, { size: 7, align: "center", color: "#f4e4c1" });
      const blink = Math.floor(this.t * 2) % 2 === 0 ? "_" : " ";
      drawText(this.name + blink, vw / 2, vh / 2 + 22, { size: 9, bold: true, align: "center", color: "#fff" });
      drawText("Enter to start   Esc back", vw / 2, vh - 24, { size: 6, align: "center", color: "#a09080" });
    }
  },
};
