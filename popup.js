// Minimap Reader - settings popup
(() => {
  const defaults = {
    mmr_enabled: true,
    mmr_collapsed: false,
    mmr_showLegend: true,
    mmr_centerOnClick: true,
    mmr_offsetTop: 0,
    mmr_activeLayers: {
      heading: true, text: true, code: true, media: true,
      table: true, quote: true, section: true, link: true, form: true
    },
    mmr_palette: {}, // { key: "#rrggbb", ... }
    mmr_intensity: { // 1.0 = 基準
      heading: 1.0, text: 1.0, code: 1.0, media: 1.0,
      table: 1.0, quote: 1.0, section: 1.0, link: 1.0, form: 1.0
    }
  };

  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  const toHex = (rgb) => {
    const [r,g,b] = rgb;
    const h = (n) => n.toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  };

  const init = async () => {
    const storage = await new Promise((resolve) => {
      chrome.storage.sync.get(Object.keys(defaults), (res) => resolve(res));
    });

    const get = (k) => storage[k] ?? defaults[k];

    // basic toggles
    qs("#enabled").checked = get("mmr_enabled");
    qs("#collapsed").checked = get("mmr_collapsed");
    qs("#showLegend").checked = get("mmr_showLegend");
    qs("#centerOnClick").checked = get("mmr_centerOnClick");
    qs("#offsetTop").value = get("mmr_offsetTop");

    // active layers
    const activeLayers = get("mmr_activeLayers");
    qsa('[data-layer]').forEach(el => {
      const key = el.getAttribute("data-layer");
      el.checked = !!activeLayers[key];
    });

    // colors
    const palette = get("mmr_palette");
    qsa('[data-color]').forEach(el => {
      const key = el.getAttribute("data-color");
      const hex = palette[key] || null;
      el.value = hex || defaultHexFor(key);
    });

    // intensity
    const intensity = get("mmr_intensity");
    qsa('[data-intensity]').forEach(el => {
      const key = el.getAttribute("data-intensity");
      el.value = Number(intensity[key] ?? 1.0);
    });

    // listeners: write through on change
    qs("#enabled").addEventListener("change", (e) => {
      chrome.storage.sync.set({ mmr_enabled: e.target.checked });
    });
    qs("#collapsed").addEventListener("change", (e) => {
      chrome.storage.sync.set({ mmr_collapsed: e.target.checked });
    });
    qs("#showLegend").addEventListener("change", (e) => {
      chrome.storage.sync.set({ mmr_showLegend: e.target.checked });
    });
    qs("#centerOnClick").addEventListener("change", (e) => {
      chrome.storage.sync.set({ mmr_centerOnClick: e.target.checked });
    });
    qs("#offsetTop").addEventListener("input", (e) => {
      const v = clampNum(Number(e.target.value), 0, 300);
      e.target.value = v;
      chrome.storage.sync.set({ mmr_offsetTop: v });
    });

    qsa('[data-layer]').forEach(el => {
      el.addEventListener("change", () => {
        const map = {};
        qsa('[data-layer]').forEach(x => {
          map[x.getAttribute("data-layer")] = x.checked;
        });
        chrome.storage.sync.set({ mmr_activeLayers: map });
      });
    });

    qsa('[data-color]').forEach(el => {
      el.addEventListener("input", () => {
        const map = {};
        qsa('[data-color]').forEach(x => {
          map[x.getAttribute("data-color")] = x.value;
        });
        chrome.storage.sync.set({ mmr_palette: map });
      });
    });

    qsa('[data-intensity]').forEach(el => {
      el.addEventListener("input", () => {
        const map = {};
        qsa('[data-intensity]').forEach(x => {
          map[x.getAttribute("data-intensity")] = Number(x.value);
        });
        chrome.storage.sync.set({ mmr_intensity: map });
      });
    });

    qs("#resetPosition").addEventListener("click", () => {
      chrome.storage.sync.set({ mmr_position: null });
    });
  };

  const clampNum = (v, min, max) => Math.min(max, Math.max(min, v));

  const defaultHexFor = (key) => {
    const preset = {
      heading: "#3b82f6",
      text: "#22c55e",
      code: "#f472b6",
      media: "#eab308",
      table: "#0284c7",
      quote: "#a855f7",
      section: "#6366f1",
      link: "#fb7185",
      form: "#10b981"
    };
    return preset[key] || "#ffffff";
  };

  document.addEventListener("DOMContentLoaded", init);
})();