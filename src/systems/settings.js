// Player settings, kept in localStorage (separate from the save, so they apply to every game).
//   confirmTrade: "always" | "never" | "some"   ask before buying/selling
//   confirmStores: { general, bakery, curios, shipping }  which stores ask when confirmTrade is "some"
const KEY = "farmgame.settings";
const DEFAULTS = { confirmTrade: "always", confirmStores: { general: true, bakery: true, curios: true, shipping: true } };

export const Settings = {
  data: null,
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { d = null; }
    this.data = Object.assign({}, DEFAULTS, d || {});
    this.data.confirmStores = Object.assign({}, DEFAULTS.confirmStores, (d && d.confirmStores) || {});
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  get() { return this.data || this.load(); },
  set(k, v) { this.get()[k] = v; this.save(); },
  // should this store ask "are you sure" before a purchase / sale?
  shouldConfirm(store) {
    const d = this.get();
    if (d.confirmTrade === "never") return false;
    if (d.confirmTrade === "always") return true;
    return !!d.confirmStores[store];
  },
};
export const STORE_NAMES = { general: "Fresh Finds (grocery)", bakery: "Sabine's Bakery", curios: "The Shiny Shelf (museum)", shipping: "Shipping bin" };
