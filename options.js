// Minimap Reader - Options page (large settings)

(() => {
  const defaults = {
    mmr_enabled: true,
    mmr_collapsed: false,
    mmr_showLegend: true,
    mmr_centerOnClick: true,
    mmr_offsetTop: 0,
    mmr_width: 180,
    mmr_heightVh: 80,
    mmr_position: null,
    mmr_activeLayers: {
      heading: true, text: true, code: true, media: true,
      table: true, quote: true, section: true, link: true, form: true
    },
    mmr_palette: {}, // { key: "#rrggbb" }
    mmr_intensity: {
      heading: 1.0, text: 1.0, code: 1.0, media: 1.0,
      table: 1.0, quote: 1.0, section: 1.0, link: 1.0, form: 1.0
    }
  };

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const presetDefs = {
    doc: {
      // ドキュメント向け: 見出し/文字/コードを強調
      mmr_activeLayers: { heading: true, text: true, code: true, media: true, table: true, quote: true, section: true, link: false, form: false },
      mmr_intensity: { heading: 1.2, text: 1.1, code: 1.1, media: 0.9, table: 0.9, quote: 1.0, section: 1.0, link: 0.8, form: 0.8 }
    },
    gallery: {
      // ギャラリー向け: 画像・メディアとリンクを強調
      mmr_activeLayers: { heading: true, text: false, code: false, media: true, table: false, quote: false, section: true, link: true, form: false },
      mmr_intensity: { heading: 1.0, text: 0.7, code: 0.7, media: 1.3, table: 0.8, quote: 0.8, section: 1.0, link: 1.1, form: 0.7 }
    },
    code: {
      // コード向け: コード/テーブル（構造化情報）を強調
      mmr_activeLayers: { heading: true, text: true, code: true, media: false, table: true, quote: true, section: true, link: true, form: false },
      mmr_intensity: { heading: 1.1, text: 0.9, code: 1.3, media: 0.7, table: 1.2, quote: 1.0, section: 1.0, link: 0.9, form: 0.7 }
    }
  };

  const init = async () => {
    const store = await new Promise((resolve) => {
      chrome.storage.sync.get(Object.keys(defaults), resolve);
    });

    const get = (k) => store[k] ?? defaults[k];

    // 基本
    el("#enabled").checked = get("mmr_enabled");
    el("#collapsed").checked = get("mmr_collapsed");
    el("#showLegend").checked = get("mmr_showLegend");
    el("#centerOnClick").checked = get("mmr_centerOnClick");
    el("#offsetTop").value = get("mmr_offsetTop");
    el("#width").value = get("mmr_width");
    el("#heightVh").value = get("mmr_heightVh");

    // レイヤ
    const active = get("mmr_activeLayers");
    els('[data-layer]').forEach(x => {
      const key = x.getAttribute("data-layer");
      x.checked = !!active[key];
    });

    // 色
    const palette = get("mmr_palette");
    els('[data-color]').forEach(x => {
      const key = x.getAttribute("data-color");
      x.value = palette[key] || defaultHexFor(key);
    });

    // 強度
    const intensity = get("mmr_intensity");
    els('[data-intensity]').forEach(x => {
      const key = x.getAttribute("data-intensity");
      x.value = Number(intensity[key] ?? 1.0);
    });

    // 変更時にストレージへ保存（ライブ反映）
    el("#enabled").addEventListener("change", e => chrome.storage.sync.set({ mmr_enabled: e.target.checked }));
    el("#collapsed").addEventListener("change", e => chrome.storage.sync.set({ mmr_collapsed: e.target.checked }));
    el("#showLegend").addEventListener("change", e => chrome.storage.sync.set({ mmr_showLegend: e.target.checked }));
    el("#centerOnClick").addEventListener("change", e => chrome.storage.sync.set({ mmr_centerOnClick: e.target.checked }));
    el("#offsetTop").addEventListener("input", e => {
      const v = clamp(Number(e.target.value || 0), 0, 300);
      e.target.value = v;
      chrome.storage.sync.set({ mmr_offsetTop: v });
    });
    el("#width").addEventListener("input", e => {
      const v = clamp(Number(e.target.value || 180), 100, 400);
      e.target.value = v;
      chrome.storage.sync.set({ mmr_width: v });
    });
    el("#heightVh").addEventListener("input", e => {
      const v = clamp(Number(e.target.value || 80), 40, 100);
      e.target.value = v;
      chrome.storage.sync.set({ mmr_heightVh: v });
    });

    els('[data-layer]').forEach(x => {
      x.addEventListener("change", () => {
        const map = {};
        els('[data-layer]').forEach(el2 => {
          map[el2.getAttribute("data-layer")] = el2.checked;
        });
        chrome.storage.sync.set({ mmr_activeLayers: map });
      });
    });

    els('[data-color]').forEach(x => {
      x.addEventListener("input", () => {
        const map = {};
        els('[data-color]').forEach(el2 => {
          map[el2.getAttribute("data-color")] = el2.value;
        });
        chrome.storage.sync.set({ mmr_palette: map });
      });
    });

    els('[data-intensity]').forEach(x => {
      x.addEventListener("input", () => {
        const map = {};
        els('[data-intensity]').forEach(el2 => {
          map[el2.getAttribute("data-intensity")] = Number(el2.value);
        });
        chrome.storage.sync.set({ mmr_intensity: map });
      });
    });

    // 位置リセット
    el("#resetPosition").addEventListener("click", () => chrome.storage.sync.set({ mmr_position: null }));

    // エクスポート
    el("#btnExport").addEventListener("click", async () => {
      const data = await new Promise(resolve => chrome.storage.sync.get(Object.keys(defaults), resolve));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "minimap-settings.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("設定をエクスポートしました。");
    });

    // インポート
    el("#fileImport").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        // 簡易バリデーション
        const keys = Object.keys(defaults);
        const payload = {};
        for (const k of keys) {
          if (k in obj) payload[k] = obj[k];
        }
        await new Promise(resolve => chrome.storage.sync.set(payload, resolve));
        setStatus("設定をインポートしました。ページに反映されます。");
      } catch (err) {
        setStatus("インポートに失敗しました（JSON形式を確認してください）。");
      } finally {
        e.target.value = "";
      }
    });

    // プリセット適用
    els(".preset").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = presetDefs[btn.getAttribute("data-preset")];
        if (!p) return;
        chrome.storage.sync.set(p, () => {
          setStatus("プリセットを適用しました。");
        });
      });
    });
  };

  const setStatus = (msg) => {
    const s = document.getElementById("status");
    if (!s) return;
    s.textContent = msg;
    s.style.opacity = "1";
    setTimeout(() => s.style.opacity = "0.8", 2200);
  };

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