// Render ```vegalite fences as Vega-Lite charts, themed from the site's CSS variables.
// Colours live in the theme stylesheet (--viz-*), so light/dark and theme swaps need no
// chart edits; charts re-render when the Material palette toggle changes the scheme.
(function () {
  const specs = new WeakMap();

  function token(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  function config() {
    const ink = token("--viz-ink"), ink2 = token("--viz-ink-2");
    const grid = token("--viz-grid"), axis = token("--viz-axis");
    const font = token("--viz-font") || "sans-serif";
    const series = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => token(`--viz-s${i}`));
    const seq = token("--viz-seq").split(",").map((s) => s.trim()).filter(Boolean);
    return {
      background: null,
      font,
      padding: { top: 4, right: 8, bottom: 4, left: 4 },
      view: { stroke: null },
      title: { color: ink, anchor: "start", fontSize: 14, fontWeight: 600, subtitleColor: ink2, subtitleFontSize: 12, offset: 10 },
      axis: {
        domainColor: axis, domainWidth: 1, tickColor: axis, tickSize: 4,
        gridColor: grid, gridWidth: 1, labelColor: ink2, titleColor: ink2,
        labelFontSize: 12, titleFontSize: 12, titleFontWeight: 500, labelPadding: 6, titlePadding: 8,
      },
      axisBand: { grid: false, domain: false, ticks: false },
      legend: { labelColor: ink2, titleColor: ink2, labelFontSize: 12, titleFontSize: 12, titleFontWeight: 500, orient: "top", symbolSize: 90 },
      header: { labelColor: ink2, titleColor: ink2, labelFontSize: 12, labelFontWeight: 500 },
      range: { category: series, heatmap: seq, ramp: seq },
      bar: { cornerRadiusEnd: 4, discreteBandSize: 18, continuousBandSize: 18 },
      line: { strokeWidth: 2, strokeCap: "round", strokeJoin: "round" },
      point: { size: 80, filled: true, opacity: 1 },
      rule: { color: grid, strokeWidth: 2 },
      text: { color: ink2, fontSize: 12 },
      rect: { cornerRadius: 2 },
      style: { "guide-label": { fill: ink2 }, "guide-title": { fill: ink2 }, "group-title": { fill: ink } },
    };
  }

  // Replace any "var(--name)" string in a spec with the token's current value.
  function resolveVars(node) {
    if (typeof node === "string") {
      const m = node.match(/^var\((--[\w-]+)\)$/);
      return m ? token(m[1]) : node;
    }
    if (Array.isArray(node)) return node.map(resolveVars);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolveVars(v)]));
    }
    return node;
  }

  async function draw(el) {
    const spec = resolveVars(specs.get(el));
    el.innerHTML = "";
    try {
      await vegaEmbed(el, spec, { config: config(), actions: false, renderer: "svg", tooltip: { theme: "custom" } });
    } catch (err) {
      el.textContent = "Chart failed to render: " + err.message;
    }
  }

  function renderAll() {
    document.querySelectorAll("pre.vegalite").forEach((pre) => {
      const el = document.createElement("div");
      el.className = "viz";
      specs.set(el, JSON.parse(pre.textContent));
      pre.replaceWith(el);
    });
    document.querySelectorAll("div.viz").forEach(draw);
  }

  new MutationObserver(() => document.querySelectorAll("div.viz").forEach(draw))
    .observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });

  if (typeof document$ !== "undefined") document$.subscribe(renderAll);
  else document.addEventListener("DOMContentLoaded", renderAll);
})();
