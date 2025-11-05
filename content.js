// Minimap Reader v0.4.0 - settings-integrated, layered color minimap + draggable popup

(() => {
  const state = {
    enabled: true,
    collapsed: false,
    showLegend: true,
    centerOnClick: true,
    offsetTop: 0, // 固定ヘッダ分のスクロール補正
    activeLayers: {
      heading: true, text: true, code: true, media: true,
      table: true, quote: true, section: true, link: true, form: true
    },
    paletteOverrides: {}, // { key: "#rrggbb" }
    intensity: { // 各レイヤの濃度係数
      heading: 1.0, text: 1.0, code: 1.0, media: 1.0,
      table: 1.0, quote: 1.0, section: 1.0, link: 1.0, form: 1.0
    },

    container: null,
    header: null,
    canvasWrap: null,
    canvas: null,
    ctx: null,
    viewportRect: null,
    legendEl: null,

    mo: null,
    redrawTimer: null,
    draggingMap: false,
    draggingUI: false,
    dragUIOffset: { x: 0, y: 0 },

    headings: [],
    dpi: Math.max(1, Math.floor(window.devicePixelRatio || 1)),
    position: null, // { x, y }

    palette: {
      layers: {
        heading: [59, 130, 246],   // 青
        text:    [34, 197, 94],    // 緑
        code:    [244, 114, 182],  // ピンク
        media:   [234, 179, 8],    // アンバー
        table:   [2, 132, 199],    // シアン
        quote:   [168, 85, 247],   // パープル
        section: [99, 102, 241],   // インディゴ
        link:    [251, 113, 133],  // ローズ
        form:    [16, 185, 129]    // エメラルド
      },
      headingLine: {
        h1: [96, 165, 250],
        h2: [52, 211, 153],
        h3: [251, 191, 36],
        h4: [244, 114, 182],
        h5: [167, 139, 250],
        h6: [203, 213, 225]
      }
    }
  };

  // Storage
  const loadSettings = () =>
    new Promise((resolve) => {
      try {
        chrome.storage?.sync?.get(
          [
            "mmr_enabled","mmr_collapsed","mmr_position","mmr_showLegend",
            "mmr_centerOnClick","mmr_offsetTop","mmr_activeLayers",
            "mmr_palette","mmr_intensity"
          ],
          (res) => {
            state.enabled = res?.mmr_enabled ?? true;
            state.collapsed = res?.mmr_collapsed ?? false;
            state.position = res?.mmr_position ?? null;
            state.showLegend = res?.mmr_showLegend ?? true;
            state.centerOnClick = res?.mmr_centerOnClick ?? true;
            state.offsetTop = Number(res?.mmr_offsetTop ?? 0);
            state.activeLayers = {
              ...state.activeLayers,
              ...(res?.mmr_activeLayers || {})
            };
            state.paletteOverrides = res?.mmr_palette || {};
            state.intensity = { ...state.intensity, ...(res?.mmr_intensity || {}) };
            resolve();
          }
        );
      } catch {
        resolve();
      }
    });

  const listenSettingsChanges = () => {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "sync") return;

      let needsRedraw = false;
      let needsViewport = false;

      if (changes.mmr_enabled) {
        state.enabled = changes.mmr_enabled.newValue;
        state.container?.classList.toggle("visible", state.enabled);
      }
      if (changes.mmr_collapsed) {
        state.collapsed = changes.mmr_collapsed.newValue;
        state.container?.classList.toggle("collapsed", state.collapsed);
        needsRedraw = true;
      }
      if (changes.mmr_showLegend) {
        state.showLegend = changes.mmr_showLegend.newValue;
        state.legendEl?.classList.toggle("hidden", !state.showLegend);
      }
      if (changes.mmr_centerOnClick) {
        state.centerOnClick = changes.mmr_centerOnClick.newValue;
      }
      if (changes.mmr_offsetTop) {
        state.offsetTop = Number(changes.mmr_offsetTop.newValue || 0);
      }
      if (changes.mmr_activeLayers) {
        state.activeLayers = { ...state.activeLayers, ...(changes.mmr_activeLayers.newValue || {}) };
        needsRedraw = true;
      }
      if (changes.mmr_palette) {
        state.paletteOverrides = changes.mmr_palette.newValue || {};
        needsRedraw = true;
      }
      if (changes.mmr_intensity) {
        state.intensity = { ...state.intensity, ...(changes.mmr_intensity.newValue || {}) };
        needsRedraw = true;
      }
      if (changes.mmr_position) {
        state.position = changes.mmr_position.newValue || null;
        resetUIPosition();
      }

      if (needsRedraw) {
        requestAnimationFrame(() => {
          resizeCanvas();
          redrawMinimap();
        });
      }
      if (needsViewport) {
        requestAnimationFrame(updateViewportRect);
      }
    });
  };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const getDocHeight = () =>
    Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0
    );

  // UI
  const buildUI = () => {
    if (document.getElementById("mmr-container")) return;

    const container = document.createElement("div");
    container.id = "mmr-container";
    container.className = "mmr-container";
    if (state.enabled) container.classList.add("visible");
    if (state.collapsed) container.classList.add("collapsed");

    // restore position
    if (state.position && Number.isFinite(state.position.x) && Number.isFinite(state.position.y)) {
      container.style.left = `${clamp(state.position.x, 0, window.innerWidth - 50)}px`;
      container.style.top = `${clamp(state.position.y, 0, window.innerHeight - 50)}px`;
      container.style.right = "auto";
      container.style.bottom = "auto";
    }

    // Header
    const header = document.createElement("div");
    header.className = "mmr-header";
    const title = document.createElement("span");
    title.className = "mmr-title";
    title.textContent = "Minimap";

    const btnWrap = document.createElement("div");
    btnWrap.className = "mmr-btn";

    const btnToggle = document.createElement("button");
    btnToggle.textContent = state.enabled ? "Hide" : "Show";
    btnToggle.title = "Alt+M でも切替できます";
    btnToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      state.enabled = !state.enabled;
      container.classList.toggle("visible", state.enabled);
      btnToggle.textContent = state.enabled ? "Hide" : "Show";
      saveSettings();
    });

    const btnCollapse = document.createElement("button");
    btnCollapse.textContent = state.collapsed ? "Expand" : "Collapse";
    btnCollapse.title = "幅のコンパクト化（Alt+Shift+C）";
    btnCollapse.addEventListener("click", (e) => {
      e.stopPropagation();
      state.collapsed = !state.collapsed;
      container.classList.toggle("collapsed", state.collapsed);
      btnCollapse.textContent = state.collapsed ? "Expand" : "Collapse";
      requestAnimationFrame(() => {
        resizeCanvas();
        redrawMinimap();
        updateViewportRect();
      });
      saveSettings();
    });

    const btnLegend = document.createElement("button");
    btnLegend.textContent = state.showLegend ? "Legend: On" : "Legend: Off";
    btnLegend.title = "凡例の表示/非表示";
    btnLegend.addEventListener("click", (e) => {
      e.stopPropagation();
      state.showLegend = !state.showLegend;
      state.legendEl?.classList.toggle("hidden", !state.showLegend);
      btnLegend.textContent = state.showLegend ? "Legend: On" : "Legend: Off";
      saveSettings();
    });

    btnWrap.appendChild(btnToggle);
    btnWrap.appendChild(btnCollapse);
    btnWrap.appendChild(btnLegend);

    header.appendChild(title);
    header.appendChild(btnWrap);

    // Canvas area
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "mmr-canvasWrap";
    const canvas = document.createElement("canvas");
    canvas.className = "mmr-canvas";
    const viewportRect = document.createElement("div");
    viewportRect.className = "mmr-viewportRect";
    canvasWrap.appendChild(canvas);
    canvasWrap.appendChild(viewportRect);

    // Legend
    const legend = document.createElement("div");
    legend.className = "mmr-legend";
    if (!state.showLegend) legend.classList.add("hidden");

    // Add to DOM
    container.appendChild(header);
    container.appendChild(canvasWrap);
    container.appendChild(legend);
    document.documentElement.appendChild(container);

    // refs
    state.container = container;
    state.header = header;
    state.canvasWrap = canvasWrap;
    state.canvas = canvas;
    state.ctx = canvas.getContext("2d", { alpha: false });
    state.viewportRect = viewportRect;
    state.legendEl = legend;

    // interactions
    setupMapInteractions(canvasWrap);
    setupUIDragging(header);
    setupShortcuts();
  };

  // map interactions (click/drag to scroll)
  const setupMapInteractions = (wrap) => {
    const getLocalY = (e) => {
      const rect = wrap.getBoundingClientRect();
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return clamp(y, 0, rect.height);
    };

    const goToLocalY = (y) => {
      const docH = getDocHeight();
      const target = (y / state.canvasWrap.clientHeight) * docH;
      const offset = state.centerOnClick ? (window.innerHeight * 0.5) : 0;
      const top = clamp(target - offset - state.offsetTop, 0, docH);
      window.scrollTo({ top, behavior: "smooth" });
    };

    wrap.addEventListener("mousedown", (e) => {
      state.draggingMap = true;
      goToLocalY(getLocalY(e));
    });
    window.addEventListener("mousemove", (e) => {
      if (!state.draggingMap) return;
      const y = getLocalY(e);
      const docH = getDocHeight();
      const target = (y / state.canvasWrap.clientHeight) * docH - (window.innerHeight * 0.5) - state.offsetTop;
      window.scrollTo({ top: clamp(target, 0, docH) });
    }, { passive: true });
    window.addEventListener("mouseup", () => { state.draggingMap = false; });

    // touch
    wrap.addEventListener("touchstart", (e) => {
      state.draggingMap = true;
      goToLocalY(getLocalY(e));
    }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (!state.draggingMap) return;
      const y = getLocalY(e);
      const docH = getDocHeight();
      const target = (y / state.canvasWrap.clientHeight) * docH - (window.innerHeight * 0.5) - state.offsetTop;
      window.scrollTo({ top: clamp(target, 0, docH) });
    }, { passive: true });
    window.addEventListener("touchend", () => { state.draggingMap = false; });
  };

  // draggable popup (header drag)
  const setupUIDragging = (header) => {
    const onDown = (e) => {
      if ((e.target instanceof Element) && e.target.closest(".mmr-btn")) return;
      state.draggingUI = true;
      state.container.classList.add("mmr-moving");
      const rect = state.container.getBoundingClientRect();

      if (state.container.style.left === "" && state.container.style.right !== "auto") {
        state.container.style.left = `${rect.left}px`;
        state.container.style.top = `${rect.top}px`;
        state.container.style.right = "auto";
        state.container.style.bottom = "auto";
      }

      const startX = (e.touches ? e.touches[0].clientX : e.clientX);
      const startY = (e.touches ? e.touches[0].clientY : e.clientY);
      state.dragUIOffset.x = startX - rect.left;
      state.dragUIOffset.y = startY - rect.top;

      e.preventDefault();
    };

    const onMove = (e) => {
      if (!state.draggingUI) return;
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
      const x = clamp(clientX - state.dragUIOffset.x, 0, window.innerWidth - state.container.offsetWidth);
      const y = clamp(clientY - state.dragUIOffset.y, 0, window.innerHeight - state.container.offsetHeight);
      state.container.style.left = `${x}px`;
      state.container.style.top = `${y}px`;
    };

    const onUp = () => {
      if (!state.draggingUI) return;
      state.draggingUI = false;
      state.container.classList.remove("mmr-moving");
      const rect = state.container.getBoundingClientRect();
      state.position = { x: rect.left, y: rect.top };
      saveSettings();
    };

    header.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);

    header.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);

    window.addEventListener("resize", () => {
      if (!state.position) return;
      const x = clamp(state.position.x, 0, window.innerWidth - state.container.offsetWidth);
      const y = clamp(state.position.y, 0, window.innerHeight - state.container.offsetHeight);
      state.container.style.left = `${x}px`;
      state.container.style.top = `${y}px`;
      state.position = { x, y };
      saveSettings();
    });
  };

  const resetUIPosition = () => {
    if (!state.container) return;
    if (state.position) {
      // move to saved
      state.container.style.left = `${clamp(state.position.x, 0, window.innerWidth - state.container.offsetWidth)}px`;
      state.container.style.top = `${clamp(state.position.y, 0, window.innerHeight - state.container.offsetHeight)}px`;
      state.container.style.right = "auto";
      state.container.style.bottom = "auto";
    } else {
      // default top-right
      state.container.style.left = "";
      state.container.style.top = "16px";
      state.container.style.right = "16px";
      state.container.style.bottom = "";
    }
  };

  const setupShortcuts = () => {
    document.addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "m") {
        state.enabled = !state.enabled;
        state.container.classList.toggle("visible", state.enabled);
        saveSettings();
      }
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "c") {
        state.collapsed = !state.collapsed;
        state.container.classList.toggle("collapsed", state.collapsed);
        requestAnimationFrame(() => {
          resizeCanvas();
          redrawMinimap();
          updateViewportRect();
        });
        saveSettings();
      }
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "l") {
        state.showLegend = !state.showLegend;
        state.legendEl?.classList.toggle("hidden", !state.showLegend);
        saveSettings();
      }
    });
  };

  // headings (overlay lines)
  const collectHeadings = () => {
    const list = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
      })
      .map((el) => ({
        el,
        level: Number(el.tagName.substring(1)),
        top: el.getBoundingClientRect().top + window.scrollY
      }));
    state.headings = list;
  };

  // Hex → RGB
  const hexToRgb = (hex) => {
    if (!hex || typeof hex !== "string") return null;
    const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const v = m[1];
    const r = parseInt(v.slice(0,2), 16);
    const g = parseInt(v.slice(2,4), 16);
    const b = parseInt(v.slice(4,6), 16);
    return [r,g,b];
  };

  // densities per layer
  const computeDensities = (H) => {
    const docH = getDocHeight();
    if (docH <= 0 || H <= 0) return { layers: [], totalRows: H };

    const catDef = [
      { key: "heading", tags: ["h1","h2","h3","h4","h5","h6"] },
      { key: "text",    tags: ["p","li","div"] },
      { key: "code",    tags: ["pre","code"] },
      { key: "media",   tags: ["img","figure","video","canvas","svg"] },
      { key: "table",   tags: ["table"] },
      { key: "quote",   tags: ["blockquote"] },
      { key: "section", tags: ["article","section"] },
      { key: "link",    tags: ["a"] },
      { key: "form",    tags: ["form","input","textarea","select"] }
    ];

    const tagToCatIndex = new Map();
    catDef.forEach((c, idx) => c.tags.forEach(t => tagToCatIndex.set(t, idx)));

    const baseWeight = {
      h1: 20, h2: 16, h3: 13, h4: 10, h5: 8, h6: 6,
      p: 6, li: 5, div: 2,
      pre: 10, code: 10,
      img: 4, figure: 4, video: 4, canvas: 4, svg: 3,
      table: 7,
      blockquote: 6,
      article: 3, section: 3,
      a: 3, form: 6, input: 5, textarea: 6, select: 5
    };

    const activeTags = Array.from(new Set(catDef.flatMap(c => c.tags)));
    const selectors = activeTags.join(",");
    const nodes = Array.from(document.querySelectorAll(selectors)).filter((el) => {
      if (el.closest("#mmr-container")) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.height > 0 && rect.width > 0;
    });

    const diffs = catDef.map(() => new Int32Array(H + 1));

    for (const el of nodes) {
      const tag = el.tagName.toLowerCase();
      const catIdx = tagToCatIndex.get(tag);
      if (catIdx == null) continue;

      const catKey = catDef[catIdx].key;
      if (!state.activeLayers[catKey]) continue; // レイヤ無効化

      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = top + rect.height;

      const y1 = clamp(Math.floor((top / docH) * H), 0, H - 1);
      const y2 = clamp(Math.ceil((bottom / docH) * H), y1 + 1, H);

      const w0 = baseWeight[tag] ?? 2;
      const layerFactor = Number(state.intensity[catKey] ?? 1.0);
      const normalize = Math.min(1, (rect.height / window.innerHeight));
      const w = Math.max(1, Math.round(w0 * layerFactor * (0.6 + 0.4 * normalize)));

      diffs[catIdx][y1] += w;
      diffs[catIdx][y2] -= w;
    }

    const layers = catDef.map((c, i) => {
      const dens = new Uint16Array(H);
      let cur = 0;
      let max = 0;
      let nonZero = 0;
      const diff = diffs[i];
      for (let y = 0; y < H; y++) {
        cur += diff[y];
        const v = cur > 0 ? cur : 0;
        dens[y] = v;
        if (v > 0) nonZero++;
        if (v > max) max = v;
      }
      // パレット上書き対応
      const override = hexToRgb(state.paletteOverrides[c.key]);
      const color = override || state.palette.layers[c.key];
      return {
        key: c.key,
        label: c.key[0].toUpperCase() + c.key.slice(1),
        color,
        dens,
        max,
        coverage: nonZero / H
      };
    });

    return { layers, totalRows: H };
  };

  const resizeCanvas = () => {
    const wrap = state.canvasWrap;
    const cssW = Math.max(10, wrap.clientWidth);
    const cssH = Math.max(10, wrap.clientHeight);
    const ratio = state.dpi;

    state.canvas.width = Math.floor(cssW * ratio);
    state.canvas.height = Math.floor(cssH * ratio);
    state.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const redrawMinimap = () => {
    const wrap = state.canvasWrap;
    const ctx = state.ctx;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (W <= 0 || H <= 0) return;

    ctx.clearRect(0, 0, W, H);

    // densities
    const { layers } = computeDensities(H);

    // paint with additive blending
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const layer of layers) {
      if (!layer.color || !state.activeLayers[layer.key]) continue;
      const [r, g, b] = layer.color;
      const max = layer.max || 1;
      for (let y = 0; y < H; y++) {
        const v = layer.dens[y];
        if (v <= 0) continue;
        const a = Math.min(0.45, Math.max(0.06, v / max));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        ctx.fillRect(0, y, W, 1);
      }
    }
    ctx.restore();

    // headings overlay lines
    collectHeadings();
    const docH = getDocHeight();
    for (const h of state.headings) {
      const yy = clamp(Math.round((h.top / docH) * H), 0, H - 1);
      const col = state.palette.headingLine["h" + h.level] || [200, 200, 200];
      const thick = h.level <= 2 ? 2 : 1;
      ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.9)`;
      ctx.fillRect(0, yy, W, thick);
    }

    // legend update
    updateLegend(layers);
  };

  const updateLegend = (layers) => {
    if (!state.legendEl) return;
    state.legendEl.innerHTML = "";

    const order = ["heading","text","code","media","table","quote","section","link","form"];
    layers.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

    for (const layer of layers) {
      if (!state.activeLayers[layer.key]) continue;
      const item = document.createElement("div");
      item.className = "mmr-legendItem";

      const dot = document.createElement("span");
      dot.className = "mmr-dot";
      dot.style.backgroundColor = `rgb(${layer.color[0]}, ${layer.color[1]}, ${layer.color[2]})`;

      const name = document.createElement("span");
      name.textContent =
        layer.key === "media" ? "Media"
        : layer.key === "section" ? "Section"
        : layer.key === "heading" ? "Heading"
        : layer.key.charAt(0).toUpperCase() + layer.key.slice(1);

      const pct = document.createElement("span");
      pct.className = "mmr-percent";
      pct.textContent = `${Math.round(layer.coverage * 100)}%`;

      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(pct);
      state.legendEl.appendChild(item);
    }
  };

  const updateViewportRect = () => {
    const H = state.canvasWrap.clientHeight;
    const docH = getDocHeight();
    const top = (window.scrollY / docH) * H;
    const h = (window.innerHeight / docH) * H;

    state.viewportRect.style.top = `${clamp(top, 0, H - h)}px`;
    state.viewportRect.style.height = `${clamp(h, 10, H)}px`;
  };

  const scheduleRedraw = (delay = 250) => {
    clearTimeout(state.redrawTimer);
    state.redrawTimer = setTimeout(() => {
      resizeCanvas();
      redrawMinimap();
      updateViewportRect();
    }, delay);
  };

  const setupMutationObserver = () => {
    if (state.mo) state.mo.disconnect();
    let pending = false;
    state.mo = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      (window.requestIdleCallback
        ? window.requestIdleCallback
        : (cb) => setTimeout(cb, 120))(() => {
          pending = false;
          scheduleRedraw(120);
        });
    });
    state.mo.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false
    });
  };

  const saveSettings = () => {
    try {
      chrome.storage?.sync?.set({
        mmr_enabled: state.enabled,
        mmr_collapsed: state.collapsed,
        mmr_position: state.position,
        mmr_showLegend: state.showLegend,
        mmr_centerOnClick: state.centerOnClick,
        mmr_offsetTop: state.offsetTop,
        mmr_activeLayers: state.activeLayers,
        mmr_palette: state.paletteOverrides,
        mmr_intensity: state.intensity
      });
    } catch {}
  };

  const init = async () => {
    const isPdf = document.contentType === "application/pdf" || /\.pdf($|\?)/i.test(location.pathname);
    if (isPdf) return;

    await loadSettings();
    buildUI();
    resizeCanvas();
    redrawMinimap();
    updateViewportRect();

    window.addEventListener("scroll", () => {
      if (!state.enabled) return;
      requestAnimationFrame(updateViewportRect);
    }, { passive: true });

    window.addEventListener("resize", () => {
      scheduleRedraw(120);
    });

    listenSettingsChanges();
    setupMutationObserver();
  };

  init();
})();