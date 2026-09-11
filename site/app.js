const heroSection = document.querySelector(".hero");
const heroTrack = document.querySelector(".hero-track");
const heroDots = document.querySelector(".hero-dots");
const track = document.querySelector(".chain-types-track");
const btnLeft = document.querySelector(".chain-types-arrow-left");
const btnRight = document.querySelector(".chain-types-arrow-right");

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
        return { ...banner, image: "" };
      }
      return banner;
    })
    .sort((a, b) => {
      if (a.type === "video" && b.type !== "video") return -1;
      if (b.type === "video" && a.type !== "video") return 1;
      return 0;
    });
}

function revealHero() {
  heroSection?.classList.remove("is-loading");
  heroSection?.classList.add("is-ready");
}

function bindHeroVideo(video) {
  const markReady = () => {
    video.classList.add("is-ready");
    const slideIndex = [...heroTrack.children].indexOf(video.closest(".hero-slide"));
    if (slideIndex === currentSlide) {
      video.play().catch(() => {});
    }
  };

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    markReady();
    return;
  }

  video.addEventListener("canplay", markReady, { once: true });
}

function goToSlide(index, total) {
  if (!heroTrack) return;
  currentSlide = index;
  heroTrack.style.transform = `translateX(-${index * 100}%)`;
  document.querySelectorAll(".hero-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
  heroTrack.querySelectorAll("video").forEach((video, i) => {
    if (i === index) {
      if (video.classList.contains("is-ready")) {
        video.play().catch(() => {});
      }
    } else {
      video.pause();
      video.currentTime = 0;
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
  if (!heroTrack || !heroDots || !slides.length) return;

  heroSection?.classList.add("is-loading");
  heroSection?.classList.remove("is-ready");

  heroTrack.innerHTML = slides.map((banner, index) => {
    const label = escapeHtml(banner.alt || banner.title || "Banner");
    const media = banner.type === "video" && banner.video
      ? `<video class="hero-video" src="${escapeHtml(banner.video)}" muted loop playsinline preload="${index === 0 ? "auto" : "metadata"}" aria-label="${label}"></video>`
      : `<img src="${escapeHtml(banner.image)}" alt="${label}">`;
    return `
    <div class="hero-slide">
      ${media}
      <div class="hero-caption">
        <h2>${escapeHtml(banner.title)}</h2>
      </div>
    </div>
  `;
  }).join("");

  heroTrack.querySelectorAll(".hero-video").forEach(bindHeroVideo);

  heroDots.innerHTML = slides.map((_, index) => `
    <button class="hero-dot${index === 0 ? " active" : ""}" type="button" aria-label="Slide ${index + 1}"></button>
  `).join("");

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

function renderShelves(products) {
  document.querySelectorAll(".product-grid[data-category]").forEach((grid) => {
    const category = grid.dataset.category;
    const items = products
      .filter((item) => item.categorySlug === category && item.showOnHome !== false)
      .slice(0, 4);
    grid.innerHTML = items.map(productCardHtml).join("") || "<p>Nenhum produto nesta categoria.</p>";
  });
}

function renderPromoShelf(products) {
  const section = document.getElementById("promocoes");
  const grid = document.getElementById("promo-grid");
  if (!section || !grid) return;

  const items = products.filter((item) => isPromoProduct(item) && item.showOnHome !== false);
  if (!items.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  grid.innerHTML = items.map(productCardHtml).join("");
}

function setupChainSlider() {
  function scrollTrack(direction) {
    const amount = track.clientWidth * 0.6;
    track.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  if (btnLeft && btnRight && track) {
    btnLeft.addEventListener("click", () => scrollTrack(-1));
    btnRight.addEventListener("click", () => scrollTrack(1));
  }
}

const PROMO_STORAGE_KEY = "lb_promo_coupon";
const PROMO_DISMISS_KEY = "lb_promo_closed";

function phoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function sellerWhatsAppLink(phone, name, couponCode) {
  const digits = phoneDigits(phone);
  if (!digits) return "";
  const normalized = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  const message = `Olá! Me chamo ${name}. Ganhei o cupom ${couponCode} no site LB jewelry e gostaria do desconto.`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

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
  waLink.href = sellerWhatsAppLink(data.sellerPhone, name, data.couponCode);
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
    image.alt = promoPopup.headline || "Promoção LB jewelry";
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

setupChainSlider();

fetchCatalog()
  .then((catalog) => {
    setupHero(catalog.banners);
    renderPromoShelf(catalog.products);
    renderShelves(catalog.products);
    setupPromoPopup(catalog.promoPopup);
  })
  .catch(() => {
    if (heroTrack && !heroTrack.children.length) {
      heroTrack.innerHTML = "<div class='hero-slide'><div class='hero-caption'><h2>LB jewelry</h2></div></div>";
    }
  });
