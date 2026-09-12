export const TS = 16;

export class Tileset {
  constructor(img, ts) {
    this.img = img;
    this.ts = ts || TS;
    this.cols = Math.floor(img.width / this.ts);
    this.rows = Math.floor(img.height / this.ts);
  }
  id(col, row) { return row * this.cols + col; }
  draw(ctx, id, dx, dy) {
    if (id < 0 || id === undefined || id === null) return;
    const ts = this.ts;
    const sx = (id % this.cols) * ts, sy = Math.floor(id / this.cols) * ts;
    ctx.drawImage(this.img, sx, sy, ts, ts, dx, dy, ts, ts);
  }
}
