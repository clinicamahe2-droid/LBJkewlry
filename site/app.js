function releaseStorefrontWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistrations()
    .then(async (registrations) => {
      const rootWorkers = registrations.filter((registration) => {
        try {
          return new URL(registration.scope).pathname === "/";
        } catch {
          return false;
        }
      });
      if (!rootWorkers.length) return;
      await Promise.all(rootWorkers.map((registration) => registration.unregister()));
      if (navigator.serviceWorker.controller) window.location.reload();
    })
    .catch(() => {});
}

releaseStorefrontWorker();
const heroSection = document.querySelector(".hero");
const heroTrack = document.querySelector(".hero-track");
const heroDots = document.querySelector(".hero-dots");
let currentSlide = 0;
let slideTimer;

function dedupeBanners(banners) {
  const seen = new Map();
  for (const banner of banners) {
    const key = banner.id || `${banner.type}-${banner.video || banner.image}`;
    seen.set(key, banner);
  }
  return [...seen.values()];
}

function prepareBanners(banners) {
  return dedupeBanners(banners || [])
    .map((banner) => {
      if (banner.type === "video" && banner.video) {
        return { ...banner, poster: banner.image || "", image: "" };
      }
      return banner;
    })
    .filter((banner) => banner.image || banner.video);
}

const CATEGORY_NAMES = { correntes: "Correntes", pulseiras: "Pulseiras", brincos: "Brincos", aneis: "Anéis" };
let heroCategories = ["correntes", "pulseiras"];

function heroCtasHtml() {
  return heroCategories.slice(0, 2).map((slug, index) => (
    `<a class="btn ${index === 0 ? "btn-light" : "btn-line"}" href="#${slug}">Ver ${CATEGORY_NAMES[slug].toLowerCase()}</a>`
  )).join("");
}

function revealHero() {
  heroSection?.classList.remove("is-loading");
  heroSection?.classList.add("is-ready");
}

function playHeroVideo(video) {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  const attempt = video.play();
  if (attempt?.catch) {
    attempt.catch(() => {});
  }
}

function bindHeroVideo(video) {
  const markReady = () => {
    if (video.classList.contains("is-ready")) return;
    video.classList.add("is-ready");
    const slideIndex = [...heroTrack.children].indexOf(video.closest(".hero-slide"));
    if (slideIndex === currentSlide) {
      playHeroVideo(video);
    }
  };

  ["loadeddata", "canplay", "playing"].forEach((eventName) => {
    video.addEventListener(eventName, markReady, { once: true });
  });
  video.addEventListener("error", markReady, { once: true });
  window.setTimeout(markReady, 2500);

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    markReady();
    return;
  }

  playHeroVideo(video);
}

function armHeroPlaybackOnInteraction() {
  const kick = () => {
    heroTrack?.querySelectorAll(".hero-video").forEach((video, index) => {
      if (index === currentSlide) {
        playHeroVideo(video);
      }
    });
  };
  document.addEventListener("touchstart", kick, { once: true, passive: true });
  document.addEventListener("click", kick, { once: true });
}

function goToSlide(index, total) {
  if (!heroTrack) return;
  currentSlide = index;
  [...heroTrack.children].forEach((slide, i) => {
    slide.classList.toggle("is-active", i === index);
  });
  document.querySelectorAll(".hero-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
  heroTrack.querySelectorAll("video").forEach((video, i) => {
    if (i === index) {
      if (video.classList.contains("is-ready")) {
        playHeroVideo(video);
      }
    } else {
      video.pause();
    }
  });
  clearInterval(slideTimer);
  const currentVideo = heroTrack.children[index]?.querySelector("video");
  if (total > 1) {
    const delay = currentVideo ? 8000 : 5000;
    slideTimer = setInterval(() => goToSlide((currentSlide + 1) % total, total), delay);
  }
}

function setupHero(banners) {
  const slides = prepareBanners(banners);
  if (!heroTrack || !heroDots || !slides.length) {
    heroSection?.setAttribute("hidden", "");
    return;
  }
  heroSection?.removeAttribute("hidden");

  heroSection?.classList.add("is-loading");
  heroSection?.classList.remove("is-ready");

  heroTrack.innerHTML = slides.map((banner, index) => {
    const label = escapeHtml(banner.alt || banner.title || "Banner");
    const poster = banner.poster ? ` poster="${escapeHtml(banner.poster)}"` : "";
    const media = banner.type === "video" && banner.video
      ? `<video class="hero-video" muted loop autoplay playsinline webkit-playsinline preload="${index === 0 ? "auto" : "metadata"}" aria-label="${label}"${poster}><source src="${escapeHtml(banner.video)}" type="video/mp4"></video>`
      : `<img src="${escapeHtml(banner.image)}" alt="${label}">`;
    const title = banner.title
      ? escapeHtml(banner.title)
      : "Brilho para usar <em>todos os dias</em>";
    return `
    <div class="hero-slide">
      <div class="hero-media">${media}</div>
      <div class="hero-copy">
        <span class="kicker">Ouro 18k · peças únicas</span>
        <h2>${title}</h2>
        <div class="hero-ctas">${heroCtasHtml()}</div>
      </div>
    </div>
  `;
  }).join("");

  heroTrack.querySelectorAll(".hero-video").forEach(bindHeroVideo);
  armHeroPlaybackOnInteraction();

  heroDots.innerHTML = slides.length > 1 ? slides.map((_, index) => `
    <button class="hero-dot${index === 0 ? " active" : ""}" type="button" aria-label="Slide ${index + 1}"></button>
  `).join("") : "";

  const dots = document.querySelectorAll(".hero-dot");
  const total = slides.length;

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => goToSlide(index, total));
  });

  goToSlide(0, total);

  const firstVideo = heroTrack.querySelector(".hero-slide:first-child .hero-video");
  if (firstVideo) {
    const done = () => revealHero();
    if (firstVideo.classList.contains("is-ready")) {
      done();
    } else {
      firstVideo.addEventListener("canplay", done, { once: true });
      setTimeout(done, 6000);
    }
  } else {
    revealHero();
  }
}

function isSellable(product) {
  return Number(product.stock) > 0 && product.showOnHome !== false;
}

// Capa da categoria: a foto "Em uso" (3ª) de uma peça à venda; sem ela, a capa da peça.
function categoryCover(items) {
  const worn = items.find((product) => product.images?.[2]);
  if (worn) return worn.images[2];
  return items.find((product) => product.image)?.image || "";
}

function renderCategoryCovers(products) {
  const sellableIn = (slug) => products.filter((product) => product.categorySlug === slug && isSellable(product));

  document.querySelectorAll("[data-category-card]").forEach((card) => {
    const items = sellableIn(card.dataset.categoryCard);
    const cover = categoryCover(items);
    if (!items.length || !cover) {
      card.hidden = true;
      return;
    }
    const img = card.querySelector("[data-category-cover]");
    img.src = cover;
    img.alt = items[0].category || "";
    card.querySelector("[data-category-count]").textContent = `${items.length} ${items.length === 1 ? "peça" : "peças"}`;
    card.hidden = false;
  });

  document.querySelectorAll("[data-category-link], [data-needs-category]").forEach((node) => {
    node.hidden = !sellableIn(node.dataset.categoryLink || node.dataset.needsCategory).length;
  });

  const withStock = Object.keys(CATEGORY_NAMES).filter((slug) => sellableIn(slug).length);
  if (withStock.length) heroCategories = withStock;
}

function renderShelves(products) {
  document.querySelectorAll(".product-grid[data-category]").forEach((grid) => {
    const category = grid.dataset.category;
    const items = products.filter((item) => item.categorySlug === category && isSellable(item));
    const section = grid.closest(".shelf");
    if (!items.length) {
      if (section) section.hidden = true;
      grid.innerHTML = "";
      return;
    }
    if (section) section.hidden = false;
    grid.innerHTML = items.map(productCardHtml).join("");
  });
}

function renderPromoShelf(products) {
  const section = document.getElementById("promocoes");
  const grid = document.getElementById("promo-grid");
  if (!section || !grid) return;

  const items = products.filter((item) => isPromoProduct(item) && isSellable(item));
  if (!items.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  grid.innerHTML = items.map(productCardHtml).join("");
  document.querySelector("[data-promo-link]")?.removeAttribute("hidden");
}

const PROMO_STORAGE_KEY = "lb_promo_coupon";
const PROMO_DISMISS_KEY = "lb_promo_closed";

function promoImageSrc(src) {
  if (!src) return "/assets/promo-coupon-setembro.jpg";
  if (/^https?:\/\//i.test(src) || src.startsWith("/")) return src;
  return `/${src}`;
}

function closePromoPopup(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const popup = document.getElementById("promo-popup");
  if (!popup) return;
  popup.classList.remove("is-open");
  popup.hidden = true;
  popup.setAttribute("hidden", "");
  document.body.classList.remove("promo-open");
  sessionStorage.setItem(PROMO_DISMISS_KEY, "1");
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-promo-close]")) {
    closePromoPopup(event);
  }
});

document.addEventListener("keydown", (event) => {
  const popup = document.getElementById("promo-popup");
  if (event.key === "Escape" && popup?.classList.contains("is-open")) {
    closePromoPopup(event);
  }
});

function showPromoCouponStep(data, name) {
  document.getElementById("promo-step-form").hidden = true;
  const couponStep = document.getElementById("promo-step-coupon");
  couponStep.hidden = false;
  document.getElementById("promo-coupon-code").textContent = data.couponCode;
  document.getElementById("promo-coupon-instruction").textContent = data.instruction
    || "Ao chamar no WhatsApp do vendedor, mencione o cupom para ganhar o desconto.";
  const waLink = document.getElementById("promo-seller-whatsapp");
  waLink.href = STORE_WHATSAPP_URL;
  localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify({
    couponCode: data.couponCode,
    name,
    claimedAt: new Date().toISOString()
  }));
}

function setupPromoPopup(promoPopup) {
  const popup = document.getElementById("promo-popup");
  const form = document.getElementById("promo-popup-form");
  if (!popup || !form || !promoPopup?.enabled) return;
  if (localStorage.getItem(PROMO_STORAGE_KEY) || sessionStorage.getItem(PROMO_DISMISS_KEY)) return;

  const image = document.getElementById("promo-popup-image");
  const imageSrc = promoImageSrc(promoPopup.image);
  if (image) {
    image.src = imageSrc;
    image.alt = promoPopup.headline || "Promoção LB18k";
  }
  const visual = document.querySelector(".promo-popup-visual");
  if (visual) {
    visual.style.backgroundImage = `url("${imageSrc}")`;
  }
  const title = document.getElementById("promo-popup-title");
  if (title && promoPopup.headline) {
    title.textContent = promoPopup.headline;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorNode = document.getElementById("promo-popup-error");
    const submitBtn = form.querySelector("button[type='submit']");
    errorNode.hidden = true;
    submitBtn.disabled = true;
    const payload = {
      name: String(form.elements.name.value || "").trim(),
      phone: String(form.elements.phone.value || "").trim()
    };
    try {
      const response = await fetch("/api/prospects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível liberar o cupom.");
      }
      showPromoCouponStep(data, payload.name);
    } catch (error) {
      errorNode.hidden = false;
      errorNode.textContent = error.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  window.setTimeout(() => {
    popup.hidden = false;
    popup.removeAttribute("hidden");
    popup.classList.add("is-open");
    document.body.classList.add("promo-open");
  }, 700);
}

fetchCatalog()
  .then((catalog) => {
    renderCategoryCovers(catalog.products);
    setupHero(catalog.banners);
    renderPromoShelf(catalog.products);
    renderShelves(catalog.products);
    setupPromoPopup(catalog.promoPopup);
  })
  .catch(() => {
    if (heroTrack && !heroTrack.children.length) {
      heroSection?.setAttribute("hidden", "");
    }
  });
