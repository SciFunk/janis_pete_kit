// Keyboard + mouse state. `down` persists, `pressed`/`released` are per-frame edges (cleared by
// endFrame()). Mouse coordinates are in native (buffer) pixels.
export const Input = {
  down: new Set(), pressed: new Set(), released: new Set(),
  mouse: { x: 0, y: 0, down: false, rdown: false, pressed: false, rpressed: false, wheel: 0 },
  scale: 1,
  typed: "",   // characters typed this frame (for text fields)

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA")) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (e.key && e.key.length === 1) this.typed += e.key;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => { this.down.delete(e.code); this.released.add(e.code); });
    window.addEventListener("blur", () => { this.down.clear(); this.mouse.down = this.mouse.rdown = false; });
    canvas.addEventListener("mousemove", (e) => { this.mouse.x = e.clientX / this.scale; this.mouse.y = e.clientY / this.scale; });
    canvas.addEventListener("mousedown", (e) => {
      this.mouse.x = e.clientX / this.scale; this.mouse.y = e.clientY / this.scale;
      if (e.button === 0) { this.mouse.down = true; this.mouse.pressed = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.mouse.rpressed = true; }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  },

  endFrame() { this.pressed.clear(); this.released.clear(); this.mouse.pressed = this.mouse.rpressed = false; this.mouse.wheel = 0; this.typed = ""; },

  isDown(...codes) { for (const c of codes) if (this.down.has(c)) return true; return false; },
  justPressed(...codes) { for (const c of codes) if (this.pressed.has(c)) return true; return false; },

  // movement axis from WASD / arrows: {dx, dy} in -1..1
  axis() {
    let dx = 0, dy = 0;
    if (this.isDown("KeyA", "ArrowLeft")) dx -= 1;
    if (this.isDown("KeyD", "ArrowRight")) dx += 1;
    if (this.isDown("KeyW", "ArrowUp")) dy -= 1;
    if (this.isDown("KeyS", "ArrowDown")) dy += 1;
    return { dx, dy };
  },
};
