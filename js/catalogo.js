/* =========================================================
   SELACT CORPORATION — Catálogo de productos
   Fuente: /api/public/catalogo del servicio NAV BI (Dynamics NAV)
   Solo artículos con existencia > 0 y no bloqueados (filtrado en el servidor).
   ========================================================= */
(() => {
  const CFG = window.SELACT_CONFIG || {};
  const PER_PAGE = CFG.productosPorPagina || 24;
  const DEMO = !CFG.apiUrl;
  const CART_KEY = "selact_cotizacion";

  const $ = (id) => document.getElementById(id);
  const grid = $("productsGrid");
  const pager = $("pagination");
  const countEl = $("resultCount");
  const searchInput = $("searchInput");

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmtMoney = (n) => "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- Estado (sincronizado con la URL) ---------- */
  const params = new URLSearchParams(location.search);
  const state = {
    buscar: params.get("buscar") || "",
    marca: params.get("marca") || "",
    grupo: params.get("grupo") || "",
    page: Math.max(parseInt(params.get("page")) || 1, 1),
  };
  let mostrarPrecios = false;
  let lastItems = [];

  const syncUrl = () => {
    const p = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => v && !(k === "page" && v === 1) && p.set(k, v));
    history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
  };

  /* ---------- Datos de demostración ---------- */
  const DEMO_ITEMS = [
    ["TL-001", "Martillo de uña 16 oz mango fibra", "TOLSEN", "HERRAMIENTA", "25016"],
    ["TL-002", "Juego de destornilladores 6 piezas", "TOLSEN", "HERRAMIENTA", "20051"],
    ["TL-003", "Taladro percutor 13mm 650W", "TOLSEN", "ELECTRICAS", "79500"],
    ["TL-004", "Cinta métrica 5m x 19mm", "TOLSEN", "MEDICION", "35018"],
    ["TL-005", "Nivel de aluminio 24 pulgadas", "TOLSEN", "MEDICION", "35054"],
    ["TL-006", "Esmeriladora angular 4-1/2\" 750W", "TOLSEN", "ELECTRICAS", "79525"],
    ["TL-007", "Llave ajustable 10 pulgadas", "TOLSEN", "HERRAMIENTA", "15011"],
    ["TL-008", "Alicate universal 8 pulgadas", "TOLSEN", "HERRAMIENTA", "10003"],
    ["SM-001", "Candado de hierro 40mm", "SAM", "CERRAJERIA", "CH-40"],
    ["SM-002", "Cerradura de pomo acero inoxidable", "SAM", "CERRAJERIA", "CP-587"],
    ["SM-003", "Bisagra de acero 3 pulgadas (par)", "SAM", "FERRETERIA", "BS-3"],
    ["SM-004", "Tornillo drywall 6 x 1-1/4 (100 und)", "SAM", "FERRETERIA", "TD-114"],
    ["SP-001", "Llave de paso 1/2\" bronce", "SAM PLUS", "PLOMERIA", "LP-12"],
    ["SP-002", "Manguera de jardín 50 pies", "SAM PLUS", "HOGAR", "MJ-50"],
    ["SP-003", "Extensión eléctrica 25 pies 3 salidas", "SAM PLUS", "ELECTRICOS", "EX-25"],
    ["SP-004", "Bombillo LED 12W luz blanca", "SAM PLUS", "ELECTRICOS", "LED-12"],
    ["SP-005", "Guantes de seguridad nitrilo (par)", "SAM PLUS", "SEGURIDAD", "GN-01"],
    ["SP-006", "Lentes de seguridad transparentes", "SAM PLUS", "SEGURIDAD", "LS-01"],
  ].map(([codigo, descripcion, marca, categoria, referencia]) => ({
    codigo, descripcion, marca, grupo: categoria, referencia, unidad: "UD", imagen: null,
  }));

  const countBy = (key) =>
    Object.entries(DEMO_ITEMS.reduce((m, it) => ((m[it[key]] = (m[it[key]] || 0) + 1), m), {}))
      .sort()
      .map(([valor, cantidad]) => ({ valor, cantidad }));

  const api = {
    async filtros() {
      if (DEMO) return { success: true, mostrarPrecios: false, marcas: countBy("marca"), grupos: countBy("grupo") };
      const r = await fetch(window.Selact.apiUrl("/api/public/catalogo/filtros?v=2"));
      return r.json();
    },
    async productos() {
      if (DEMO) {
        const words = state.buscar.toLowerCase().split(/\s+/).filter(Boolean);
        const all = DEMO_ITEMS.filter(
          (it) =>
            (!state.marca || it.marca === state.marca) &&
            (!state.grupo || it.grupo === state.grupo) &&
            words.every((w) => `${it.codigo} ${it.descripcion} ${it.referencia}`.toLowerCase().includes(w))
        );
        const pages = Math.max(Math.ceil(all.length / PER_PAGE), 1);
        await new Promise((r) => setTimeout(r, 250));
        return { success: true, total: all.length, pages, page: state.page, data: all.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE) };
      }
      const q = new URLSearchParams({ page: state.page, limit: PER_PAGE });
      if (state.buscar) q.set("buscar", state.buscar);
      if (state.marca) q.set("marca", state.marca);
      if (state.grupo) q.set("grupo", state.grupo);
      const r = await fetch(window.Selact.apiUrl(`/api/public/catalogo?${q}`));
      return r.json();
    },
  };

  /* ---------- Filtros ---------- */
  const renderChips = (container, items, key) => {
    container.innerHTML = [{ valor: "", label: "Todas" }, ...items]
      .map(
        (it) =>
          `<button type="button" class="chip${state[key] === it.valor ? " is-active" : ""}" data-value="${esc(it.valor)}">` +
          `${esc(it.label || it.valor)}${it.cantidad ? `<small>${it.cantidad}</small>` : ""}</button>`
      )
      .join("");
    container.onclick = (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state[key] = chip.dataset.value;
      state.page = 1;
      container.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      load();
    };
  };

  const chipsNoDisponible = (c) => (c.innerHTML = '<small style="color:var(--gray-500)">No disponible</small>');

  async function loadFiltros() {
    let json = null;
    try {
      json = await api.filtros();
      if (!json || !json.success) throw new Error();
    } catch {
      $("filters").querySelectorAll(".chips").forEach(chipsNoDisponible);
      return;
    }
    mostrarPrecios = !!json.mostrarPrecios;
    const marcas = Array.isArray(json.marcas) ? json.marcas : [];
    const grupos = Array.isArray(json.grupos) ? json.grupos : Array.isArray(json.categorias) ? json.categorias : [];

    // Si la marca de la URL no coincide exactamente (mayúsculas), se ajusta a la de NAV
    const match = marcas.find((m) => m.valor.toUpperCase() === state.marca.toUpperCase());
    if (match) state.marca = match.valor;

    marcas.length ? renderChips($("brandChips"), marcas, "marca") : chipsNoDisponible($("brandChips"));
    grupos.length ? renderChips($("categoryChips"), grupos, "grupo") : chipsNoDisponible($("categoryChips"));
  }

  /* ---------- Productos ---------- */
  const imgUrl = (p) => (p.imagen ? (DEMO ? p.imagen : window.Selact.apiUrl(p.imagen)) : null);

  // Si el navegador no carga la imagen directamente (pasa en algunos Firefox con
  // extensiones o protección contra rastreo), se reintenta descargándola con fetch,
  // igual que los datos del catálogo. Si también falla, se muestra el logo.
  window.selactImgError = (img) => {
    const showLogo = () => {
      img.onerror = null;
      img.className = "product__noimg";
      img.src = "assets/img/logo-selact.png";
    };
    if (img.dataset.retried || !img.dataset.src) return showLogo();
    img.dataset.retried = "1";
    fetch(img.dataset.src, { mode: "cors", cache: "reload" })
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
      .then((blob) => {
        img.onerror = showLogo;
        img.src = URL.createObjectURL(blob);
      })
      .catch(showLogo);
  };

  const productCard = (p) => {
    const inCart = cart.has(p.codigo);
    const src = imgUrl(p);
    return `
      <article class="product${inCart ? " is-added" : ""}" data-code="${esc(p.codigo)}">
        <div class="product__img">
          <span class="product__stock">Disponible</span>
          ${
            src
              ? `<img src="${esc(src)}" data-src="${esc(src)}" alt="${esc(p.descripcion)}" loading="lazy" referrerpolicy="no-referrer" onerror="selactImgError(this)">`
              : `<img class="product__noimg" src="assets/img/logo-selact.png" alt="">`
          }
        </div>
        <div class="product__body">
          ${p.marca ? `<span class="product__brand">${esc(p.marca)}</span>` : p.grupo ? `<span class="product__brand product__brand--muted">${esc(p.grupo)}</span>` : ""}
          <h3 class="product__name">${esc(p.descripcion)}</h3>
          <span class="product__meta">Cód. ${esc(p.codigo)}${p.referencia ? ` · Ref. ${esc(p.referencia)}` : ""}</span>
          ${mostrarPrecios && p.precio != null ? `<span class="product__price">${fmtMoney(p.precio)}</span>` : ""}
          <div class="product__actions">
            <button type="button" class="btn btn--navy btn--sm btn--block js-add">${inCart ? "✓ En la lista" : "Agregar a cotización"}</button>
          </div>
        </div>
      </article>`;
  };

  const renderPager = (page, pages) => {
    if (pages <= 1) return (pager.innerHTML = "");
    const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
    const sorted = [...nums].sort((a, b) => a - b);
    let html = `<button type="button" data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Anterior">‹</button>`;
    sorted.forEach((n, i) => {
      if (i && n - sorted[i - 1] > 1) html += `<button type="button" disabled>…</button>`;
      html += `<button type="button" data-page="${n}" class="${n === page ? "is-active" : ""}">${n}</button>`;
    });
    html += `<button type="button" data-page="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="Siguiente">›</button>`;
    pager.innerHTML = html;
  };

  pager.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-page]");
    if (!b || b.disabled) return;
    state.page = Number(b.dataset.page);
    load();
    document.querySelector(".catalog").scrollIntoView({ behavior: "smooth" });
  });

  let reqId = 0;
  async function load() {
    syncUrl();
    const id = ++reqId;
    grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join("");
    countEl.textContent = "Cargando…";
    try {
      const json = await api.productos();
      if (id !== reqId) return;
      if (!json.success) throw new Error(json.message);
      lastItems = json.data;
      countEl.textContent = `${json.total.toLocaleString("es-DO")} producto${json.total === 1 ? "" : "s"}`;
      if (!json.data.length) {
        grid.innerHTML = `
          <div class="state">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>
            <h3>No encontramos productos</h3>
            <p>Prueba con otra búsqueda o escríbenos: lo conseguimos para ti.</p>
            <a class="btn btn--whatsapp" target="_blank" rel="noopener" href="${esc(window.Selact.waLink(`Hola, estoy buscando: ${state.buscar}`))}">Consultar por WhatsApp</a>
          </div>`;
      } else grid.innerHTML = json.data.map(productCard).join("");
      renderPager(json.page || state.page, json.pages || 1);
    } catch {
      if (id !== reqId) return;
      countEl.textContent = "";
      pager.innerHTML = "";
      grid.innerHTML = `
        <div class="state">
          <svg viewBox="0 0 24 24"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>
          <h3>El catálogo no está disponible en este momento</h3>
          <p>Escríbenos por WhatsApp y te ayudamos con tu pedido.</p>
          <a class="btn btn--whatsapp" target="_blank" rel="noopener" href="${esc(window.Selact.waLink(CFG.mensajeWhatsapp))}">Escribir por WhatsApp</a>
        </div>`;
    }
  }

  /* ---------- Búsqueda ---------- */
  searchInput.value = state.buscar;
  let t;
  searchInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.buscar = searchInput.value.trim();
      state.page = 1;
      load();
    }, 350);
  });

  $("clearFilters").addEventListener("click", () => {
    Object.assign(state, { buscar: "", marca: "", grupo: "", page: 1 });
    searchInput.value = "";
    document.querySelectorAll("#filters .chip").forEach((c) => c.classList.toggle("is-active", c.dataset.value === ""));
    load();
  });
  $("filtersToggle").addEventListener("click", () => $("filters").classList.toggle("is-open"));

  /* =========================================================
     Lista de cotización (se guarda en el navegador)
     ========================================================= */
  const cart = new Map();
  try {
    (JSON.parse(localStorage.getItem(CART_KEY)) || []).forEach((it) => cart.set(it.codigo, it));
  } catch {}
  const saveCart = () => {
    try { localStorage.setItem(CART_KEY, JSON.stringify([...cart.values()])); } catch {}
    $("cartCount").textContent = [...cart.values()].reduce((s, it) => s + it.qty, 0);
    renderCart();
  };

  const renderCart = () => {
    const box = $("cartItems");
    if (!cart.size) {
      box.innerHTML = '<p class="cart-empty">Tu lista está vacía.<br>Agrega productos desde el catálogo.</p>';
      $("cartSend").disabled = true;
      return;
    }
    $("cartSend").disabled = false;
    box.innerHTML = [...cart.values()]
      .map(
        (it) => `
        <div class="cart-item" data-code="${esc(it.codigo)}">
          <div>
            <div class="cart-item__name">${esc(it.descripcion)}</div>
            <div class="cart-item__code">Cód. ${esc(it.codigo)}${it.marca ? ` · ${esc(it.marca)}` : ""}</div>
          </div>
          <div class="cart-item__qty">
            <button type="button" data-act="dec" aria-label="Menos">−</button>
            <input type="number" min="1" value="${it.qty}" aria-label="Cantidad">
            <button type="button" data-act="inc" aria-label="Más">+</button>
          </div>
          <button type="button" class="cart-item__remove" data-act="del">Quitar</button>
        </div>`
      )
      .join("");
  };

  const markCard = (code) => {
    const card = grid.querySelector(`.product[data-code="${CSS.escape(code)}"]`);
    if (!card) return;
    const added = cart.has(code);
    card.classList.toggle("is-added", added);
    card.querySelector(".js-add").textContent = added ? "✓ En la lista" : "Agregar a cotización";
  };

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-add");
    if (!btn) return;
    const code = btn.closest(".product").dataset.code;
    if (cart.has(code)) {
      openDrawer();
      return;
    }
    const p = lastItems.find((x) => x.codigo === code);
    if (!p) return;
    cart.set(code, { codigo: p.codigo, descripcion: p.descripcion, marca: p.marca, unidad: p.unidad, qty: 1 });
    saveCart();
    markCard(code);
    const cb = $("cartBtn");
    cb.classList.remove("bump");
    void cb.offsetWidth;
    cb.classList.add("bump");
  });

  $("cartItems").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const code = b.closest(".cart-item").dataset.code;
    const it = cart.get(code);
    if (b.dataset.act === "inc") it.qty++;
    if (b.dataset.act === "dec") it.qty = Math.max(1, it.qty - 1);
    if (b.dataset.act === "del") cart.delete(code);
    saveCart();
    markCard(code);
  });
  $("cartItems").addEventListener("change", (e) => {
    if (e.target.type !== "number") return;
    const code = e.target.closest(".cart-item").dataset.code;
    cart.get(code).qty = Math.max(1, parseInt(e.target.value) || 1);
    saveCart();
  });

  const drawer = $("drawer");
  const overlay = $("drawerOverlay");
  const openDrawer = () => {
    drawer.classList.add("is-open");
    overlay.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
  };
  const closeDrawer = () => {
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  };
  $("cartBtn").addEventListener("click", openDrawer);
  $("drawerClose").addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

  $("cartClear").addEventListener("click", () => {
    const codes = [...cart.keys()];
    cart.clear();
    saveCart();
    codes.forEach(markCard);
  });

  $("cartSend").addEventListener("click", () => {
    if (!cart.size) return;
    const nombre = $("cartName").value.trim();
    const lines = [...cart.values()].map((it, i) => `${i + 1}. ${it.descripcion} (Cód. ${it.codigo}) — Cant: ${it.qty} ${it.unidad || ""}`.trim());
    const msg =
      `Hola Selact Corporation, quisiera cotizar los siguientes productos:\n\n${lines.join("\n")}` +
      (nombre ? `\n\nNombre / Empresa: ${nombre}` : "");
    window.open(window.Selact.waLink(msg), "_blank", "noopener");
  });

  /* ---------- Inicio ---------- */
  if (DEMO) $("demoBanner").hidden = false;
  saveCart();
  loadFiltros().then(load);
})();
