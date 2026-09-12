// A* on the map's tile grid (4-neighbour). Returns an array of [tx,ty] from start (exclusive) to
// goal (inclusive), or null. `passable(x,y)` lets callers add dynamic blockers.
export function findPath(map, sx, sy, gx, gy, passable, maxNodes) {
  maxNodes = maxNodes || 6000;
  if (!map.inBounds(gx, gy)) return null;
  const W = map.w, H = map.h;
  const key = (x, y) => y * W + x;
  const open = [];   // binary heap of [f, x, y]
  const g = new Map(), from = new Map(), closed = new Set();
  const h = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);
  const push = (n) => { open.push(n); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
  g.set(key(sx, sy), 0); push([h(sx, sy), sx, sy]);
  let n = 0;
  while (open.length && n++ < maxNodes) {
    const [, x, y] = pop();
    const k = key(x, y);
    if (closed.has(k)) continue;
    closed.add(k);
    if (x === gx && y === gy) {
      const path = []; let c = k;
      while (c !== key(sx, sy)) { path.push([c % W, Math.floor(c / W)]); c = from.get(c); }
      return path.reverse();
    }
    const gc = g.get(k);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const isGoal = nx === gx && ny === gy;
      if (!isGoal && (map.isSolid(nx, ny) || (passable && !passable(nx, ny)))) continue;
      const ng = gc + 1;
      if (g.has(nk) && g.get(nk) <= ng) continue;
      g.set(nk, ng); from.set(nk, k); push([ng + h(nx, ny), nx, ny]);
    }
  }
  return null;
}
