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

  // Split text into lines no wider than max pixels in the given CSS font.
  let measure;
  function wrap(text, font, max) {
    measure = measure || document.createElement("canvas").getContext("2d");
    measure.font = font;
    const lines = [];
    let line = "";
    for (const word of [].concat(text).join(" ").split(/\s+/)) {
      const next = line ? line + " " + word : word;
      if (line && measure.measureText(next).width > max) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  // A container-width chart counts its title in its width, so a one-line subtitle wider than
  // the page squeezes the plot, to nothing on a phone. Wrap title and subtitle to fit instead.
  function fitTitle(spec, width, cfg) {
    const max = width - cfg.padding.left - cfg.padding.right - 4;
    if (!spec.title || max < 100) return spec;
    const t = typeof spec.title === "string" ? { text: spec.title } : { ...spec.title };
    t.text = wrap(t.text, `${cfg.title.fontWeight} ${cfg.title.fontSize}px ${cfg.font}`, max);
    if (t.subtitle) t.subtitle = wrap(t.subtitle, `${cfg.title.subtitleFontSize}px ${cfg.font}`, max);
    return { ...spec, title: t };
  }

  async function draw(el) {
    if (document.fonts) await document.fonts.ready;  // measure titles in the page's own font
    const cfg = config();
    const spec = fitTitle(resolveVars(specs.get(el)), el.clientWidth, cfg);
    el.innerHTML = "";
    try {
      await vegaEmbed(el, spec, { config: cfg, actions: false, renderer: "svg", tooltip: { theme: "custom" } });
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

  // Re-wrap the titles when the page width changes, e.g. when a phone is turned.
  let pageWidth = window.innerWidth, resized;
  window.addEventListener("resize", () => {
    clearTimeout(resized);
    resized = setTimeout(() => {
      if (Math.abs(window.innerWidth - pageWidth) < 40) return;
      pageWidth = window.innerWidth;
      document.querySelectorAll("div.viz").forEach(draw);
    }, 250);
  });

  if (typeof document$ !== "undefined") document$.subscribe(renderAll);
  else document.addEventListener("DOMContentLoaded", renderAll);
})();
