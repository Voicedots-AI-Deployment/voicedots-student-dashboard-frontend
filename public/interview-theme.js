(() => {
      try {
        const theme = JSON.parse(sessionStorage.getItem("vd_theme") || "{}");
        const color = /^#[0-9a-f]{6}$/i.test(theme.primary_color || "") ? theme.primary_color : "#7c3aed";
        const n = parseInt(color.slice(1), 16);
        const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        const mix = (toward, amount) => {
          const t = parseInt(toward.slice(1), 16);
          const tr = (t >> 16) & 255, tg = (t >> 8) & 255, tb = t & 255;
          const f = (a,b) => Math.round(a + (b-a)*amount);
          return `#${[f(rgb[0],tr),f(rgb[1],tg),f(rgb[2],tb)].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
        };
        const style = document.documentElement.style;
        style.setProperty("--accent", color);
        style.setProperty("--accent-rgb", rgb.join(","));
        style.setProperty("--accent-hover", mix("#000000", .14));
        style.setProperty("--accent-bright", mix("#ffffff", .67));
        style.setProperty("--accent-soft", `rgba(${rgb.join(",")},.15)`);
        style.setProperty("--accent-border", `rgba(${rgb.join(",")},.28)`);
      } catch (_) {}
    })();
