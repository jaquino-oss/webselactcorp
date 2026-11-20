/* =========================================================
   SELACT CORPORATION — Scripts comunes (todas las páginas)
   Los datos se editan en js/config.js
   ========================================================= */
const CONFIG = window.SELACT_CONFIG || {};

const Selact = {
  waLink(text) {
    if (!CONFIG.whatsapp) return "https://www.instagram.com/selactcorp/";
    const base = `https://wa.me/${CONFIG.whatsapp}`;
    return text ? `${base}?text=${encodeURIComponent(text)}` : base;
  },
  apiUrl(path) {
    return CONFIG.apiUrl ? CONFIG.apiUrl.replace(/\/+$/, "") + path : null;
  },
};
window.Selact = Selact;

document.addEventListener("DOMContentLoaded", () => {
  /* ---------- Datos de contacto ---------- */
  document.querySelectorAll(".js-whatsapp").forEach((a) => (a.href = Selact.waLink(CONFIG.mensajeWhatsapp)));
  document.querySelectorAll(".js-phone-text").forEach((el) => CONFIG.telefono && (el.textContent = CONFIG.telefono));

  const phone = document.querySelector(".js-phone");
  if (phone) {
    phone.textContent = CONFIG.telefono || "";
    phone.href = CONFIG.whatsapp ? `tel:+${CONFIG.whatsapp}` : "#";
  }
  const emailRow = document.querySelector(".js-email-row");
  if (emailRow) {
    if (CONFIG.email) {
      const a = emailRow.querySelector(".js-email");
      a.textContent = CONFIG.email;
      a.href = `mailto:${CONFIG.email}`;
    } else emailRow.hidden = true;
  }
  const hoursRow = document.querySelector(".js-hours-row");
  if (hoursRow) {
    if (CONFIG.horario) hoursRow.querySelector(".js-hours").innerHTML = CONFIG.horario;
    else hoursRow.hidden = true;
  }
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Header con sombra al hacer scroll ---------- */
  const header = document.getElementById("header");
  const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Menú móvil ---------- */
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("nav");
  if (toggle && nav) {
    const closeMenu = () => {
      nav.classList.remove("is-open");
      toggle.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
  }

  /* ---------- Link activo según sección (solo anclas) ---------- */
  const links = [...document.querySelectorAll('.nav__link[href^="#"]')];
  const sections = links.map((l) => document.querySelector(l.getAttribute("href"))).filter(Boolean);
  if (sections.length) {
    const spy = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting)
            links.forEach((l) => l.classList.toggle("is-active", l.getAttribute("href") === `#${e.target.id}`));
        }),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach((s) => spy.observe(s));
  }

  /* ---------- Galería (fotos locales) ---------- */
  const gallery = document.getElementById("galleryGrid");
  if (gallery) {
    for (let i = 1; i <= 8; i++) {
      gallery.insertAdjacentHTML(
        "beforeend",
        `<a class="photo" href="https://www.instagram.com/selactcorp/" target="_blank" rel="noopener" aria-label="Ver en Instagram">
           <img src="assets/img/fotos/galeria-${i}.jpg" alt="Selact Corporation - foto ${i}" loading="lazy">
           <div class="photo__fallback"><div><img src="assets/img/logo-selact.png" alt="">galeria-${i}.jpg</div></div>
         </a>`
      );
    }
  }

  /* ---------- Fotos: si el archivo no existe se muestra un respaldo ---------- */
  document.querySelectorAll(".photo > img").forEach((img) => {
    const markMissing = () => img.parentElement.classList.add("is-missing");
    if (img.complete && img.naturalWidth === 0) markMissing();
    img.addEventListener("error", markMissing);
  });

  /* ---------- Animaciones al aparecer ---------- */
  const revealObs = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          revealObs.unobserve(e.target);
        }
      }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealObs.observe(el));

  /* ---------- Contadores ---------- */
  const animateCount = (el, target) => {
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / 1600, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("es-DO");
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const countObs = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        animateCount(e.target, Number(e.target.dataset.count));
        countObs.unobserve(e.target);
      }),
    { threshold: 0.6 }
  );
  document.querySelectorAll("[data-count]").forEach((el) => countObs.observe(el));

  /* ---------- Total de productos en existencia (desde la API) ---------- */
  const totalEl = document.querySelector("[data-catalog-total]");
  const totalUrl = Selact.apiUrl("/api/public/catalogo?limit=1");
  if (totalEl && totalUrl) {
    fetch(totalUrl)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.total > 0) {
          totalEl.dataset.count = json.total;
          document.querySelector("[data-catalog-label]").textContent = "productos en existencia";
          countObs.observe(totalEl);
        }
      })
      .catch(() => {});
  }

  /* ---------- Carrusel principal (video + fotos) ---------- */
  const slider = document.querySelector(".hero-slider");
  if (slider) {
    const slides = [...slider.querySelectorAll(".slide")];
    const dotsBox = slider.querySelector(".hero-slider__dots");
    const pauseBtn = slider.querySelector(".hero-slider__pause");
    const IMG_TIME = 7000;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let current = 0;
    let elapsed = 0;
    let last = 0;
    let paused = reduceMotion; // con "reducir movimiento" no avanza solo
    let hovering = false;

    const mediaOf = (s) => s.querySelector(".slide__media");
    const videoOf = (s) => {
      const m = mediaOf(s);
      return m && m.tagName === "VIDEO" && !m.classList.contains("is-missing") ? m : null;
    };

    // Archivos que no existen → se ocultan y queda el fondo azul de la marca
    slides.forEach((s) => {
      const m = mediaOf(s);
      if (!m) return;
      if (m.tagName === "VIDEO") {
        const src = m.querySelector("source");
        const fail = () => {
          m.classList.add("is-missing");
          if (slides[current] === s) elapsed = 0;
        };
        (src || m).addEventListener("error", fail);
        setTimeout(() => m.networkState === 3 && fail(), 1500); // 3 = sin fuente válida
        m.addEventListener("ended", () => slides[current] === s && go(current + 1));
      } else {
        m.loading = "eager";
        m.addEventListener("error", () => m.classList.add("is-missing"));
        if (m.complete && !m.naturalWidth) m.classList.add("is-missing");
      }
    });

    const dots = slides.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hero-slider__dot";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", `Diapositiva ${i + 1}`);
      b.innerHTML = "<span></span>";
      b.addEventListener("click", () => go(i));
      dotsBox.appendChild(b);
      return b;
    });

    const duration = (s) => {
      const v = videoOf(s);
      if (v && v.duration && isFinite(v.duration)) return v.duration * 1000;
      return v ? Number(s.dataset.duration) || 15000 : IMG_TIME;
    };

    function go(i) {
      const prev = slides[current];
      const pv = videoOf(prev);
      if (pv) pv.pause();
      prev.classList.remove("is-active");
      current = (i + slides.length) % slides.length;
      const s = slides[current];
      s.classList.add("is-active");
      elapsed = 0;
      dots.forEach((d, k) => {
        d.classList.toggle("is-done", k < current);
        d.setAttribute("aria-selected", k === current);
        d.firstChild.style.width = "0";
      });
      const v = videoOf(s);
      if (v) {
        v.currentTime = 0;
        if (!paused) v.play().catch(() => {});
      }
    }

    function setPaused(p) {
      paused = p;
      slider.classList.toggle("is-paused", p);
      pauseBtn.setAttribute("aria-label", p ? "Reproducir" : "Pausar");
      const v = videoOf(slides[current]);
      if (v) p ? v.pause() : v.play().catch(() => {});
    }

    function tick() {
      const now = performance.now();
      const dt = last ? Math.min(now - last, 250) : 0;
      last = now;
      const s = slides[current];
      const v = videoOf(s);
      if (v && !v.paused && v.duration) {
        // El video manda: avanza cuando termina (evento "ended")
        dots[current].firstChild.style.width = `${(v.currentTime / v.duration) * 100}%`;
      } else if (!paused && !hovering && !document.hidden) {
        // Si el video aún no arranca, se intenta reproducir; mientras tanto corre el tiempo de respaldo
        if (v && v.paused && v.readyState >= 2) v.play().catch(() => {});
        elapsed += dt;
        const d = duration(s);
        dots[current].firstChild.style.width = `${Math.min(elapsed / d, 1) * 100}%`;
        if (elapsed >= d) go(current + 1);
      }
    }

    slider.querySelectorAll("[data-dir]").forEach((b) =>
      b.addEventListener("click", () => go(current + Number(b.dataset.dir)))
    );
    pauseBtn.addEventListener("click", () => setPaused(!paused));
    slider.addEventListener("mouseenter", () => (hovering = true));
    slider.addEventListener("mouseleave", () => (hovering = false));
    slider.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") go(current + 1);
      if (e.key === "ArrowLeft") go(current - 1);
    });
    // Deslizar con el dedo en el celular
    let touchX = null;
    slider.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
    slider.addEventListener("touchend", (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) go(current + (dx < 0 ? 1 : -1));
      touchX = null;
    });

    go(0);
    setPaused(paused);
    setInterval(tick, 50);
  }

  /* ---------- Marcas reales desde NAV ---------- */
  const brandsGrid = document.getElementById("brandsGrid");
  const filtrosUrl = Selact.apiUrl("/api/public/catalogo/filtros?v=2");
  if (brandsGrid && filtrosUrl) {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmt = (n) => Number(n).toLocaleString("es-DO");
    fetch(filtrosUrl)
      .then((r) => r.json())
      .then((json) => {
        const marcas = (json.marcas || []).filter((m) => m && m.valor);
        if (!marcas.length) return;
        // Las dos marcas principales van destacadas; el resto en cuadrícula
        brandsGrid.innerHTML = marcas
          .map((m, i) => {
            let cls = i === 0 ? "brand brand--wide" : i === 1 ? "brand brand--wide brand--alt" : "brand";
            if (m.valor.toUpperCase() === "TOLSEN") cls += " brand--tolsen";
            const extra = m.valor.toUpperCase() === "SAM" ? "Incluye línea SAM Plus · " : "";
            const n = m.cantidad === 1 ? "1 producto" : `${fmt(m.cantidad)} productos`;
            return `<a href="catalogo.html?marca=${encodeURIComponent(m.valor)}" class="${cls}"><strong>${esc(m.valor)}</strong><span>${extra}${n}</span></a>`;
          })
          .join("");
        const totalBrands = document.querySelector("[data-brand-total]");
        if (totalBrands) {
          totalBrands.dataset.count = marcas.length;
          totalBrands.textContent = marcas.length;
        }
      })
      .catch(() => {});
  }

  /* ---------- Formulario de cotización → WhatsApp ---------- */
  const form = document.getElementById("quoteForm");
  if (form) {
    const note = document.getElementById("formNote");
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      let valid = true;
      form.querySelectorAll("[required]").forEach((f) => {
        const ok = f.value.trim() !== "";
        f.classList.toggle("is-invalid", !ok);
        if (!ok) valid = false;
      });
      if (!valid) {
        note.textContent = "Por favor completa los campos obligatorios.";
        return;
      }
      note.textContent = "";
      const d = new FormData(form);
      const msg =
        `Hola Selact Corporation, quisiera una cotización.\n\n` +
        `• Nombre: ${d.get("nombre")}\n` +
        (d.get("empresa") ? `• Empresa: ${d.get("empresa")}\n` : "") +
        `• Teléfono: ${d.get("telefono")}\n` +
        `• Categoría: ${d.get("categoria")}\n\n` +
        `${d.get("mensaje")}`;
      window.open(Selact.waLink(msg), "_blank", "noopener");
      form.reset();
    });
  }
});
