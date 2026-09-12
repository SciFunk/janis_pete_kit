// Asset registry. Assets.load({images:{key:path}, json:{key:path}}) then Assets.img.key / Assets.data.key.
export const Assets = {
  img: {}, data: {},

  loadImage(path) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("failed to load image " + path));
      im.src = path;
    });
  },

  async loadJson(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error("failed to load " + path + ": " + r.status);
    return r.json();
  },

  async load(manifest) {
    const jobs = [];
    for (const [k, p] of Object.entries(manifest.images || {})) jobs.push(this.loadImage(p).then((im) => { this.img[k] = im; }));
    for (const [k, p] of Object.entries(manifest.json || {})) jobs.push(this.loadJson(p).then((d) => { this.data[k] = d; }));
    await Promise.all(jobs);
  },

  // lazily load one image by key/path (used for maps/tilesets that aren't in the boot manifest)
  async image(key, path) {
    if (!this.img[key]) this.img[key] = await this.loadImage(path);
    return this.img[key];
  },
};
