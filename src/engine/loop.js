// Fixed-cap variable-timestep loop.
export function startLoop(update, draw) {
  let last = performance.now();
  function frame(t) {
    let dt = (t - last) / 1000;
    last = t;
    if (dt > 0.1) dt = 0.1;
    try {
      update(dt);
      draw();
    } catch (e) {
      console.error(e);
      const el = document.getElementById("err");
      if (el) el.textContent += (e.stack || e) + "\n";
      return; // stop the loop on a hard error so it's obvious
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
