// Screen: a native-resolution offscreen buffer (`buf`, drawn at 16px-per-tile) presented onto the
// window canvas with an integer scale. World drawing goes to `bctx`; crisp UI text goes to `ctx`
// (the scaled screen canvas) via ui/text.js. Native size adapts so the window is always filled.
export const Screen = {
  canvas: null, ctx: null, buf: null, bctx: null,
  scale: 1, vw: 480, vh: 270, W: 0, H: 0,
  forceScale: 0,              // set by the editor's zoom buttons; 0 = fit the window

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.buf = document.createElement("canvas");
    this.bctx = this.buf.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
  },

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const s = this.forceScale || Math.max(1, Math.floor(Math.min(W / 400, H / 240)));
    this.scale = s;
    this.vw = Math.ceil(W / s);
    this.vh = Math.ceil(H / s);
    this.W = W; this.H = H;
    this.canvas.width = W; this.canvas.height = H;
    this.buf.width = this.vw; this.buf.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;
    this.bctx.imageSmoothingEnabled = false;
  },

  clear(color) {
    this.bctx.fillStyle = color || "#000";
    this.bctx.fillRect(0, 0, this.vw, this.vh);
  },

  present() {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.buf, 0, 0, this.vw * this.scale, this.vh * this.scale);
  },
};
