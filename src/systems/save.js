// Save/load: one JSON blob in localStorage (plus download/upload helpers). Modules register
// {key, save(), load(data)} so new systems can persist without touching this file.
const KEY = "farmgame.save.v1";

export const Save = {
  modules: [],
  register(key, save, load) { this.modules.push({ key: key, save: save, load: load }); },

  build() {
    const out = { version: 1, savedAt: Date.now() };
    for (const m of this.modules) out[m.key] = m.save();
    return out;
  },
  disabled: false,           // the cave try-out never writes a save
  write() {
    if (this.disabled) return false;
    try { localStorage.setItem(KEY, JSON.stringify(this.build())); return true; }
    catch (e) { console.error("save failed", e); return false; }
  },
  exists() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } },
  read() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  // apply a blob; modules whose key is missing get undefined (they must tolerate it)
  apply(data) { for (const m of this.modules) m.load(data[m.key]); },
  download() {
    const blob = new Blob([JSON.stringify(this.build(), null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "farm-save.json"; a.click();
  },
};
