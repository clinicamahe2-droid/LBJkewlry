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

setupChainSlider();

fetchCatalog()
  .then((catalog) => {
    setupHero(catalog.banners);
    renderShelves(catalog.products);
  })
  .catch(() => {
    if (heroTrack && !heroTrack.children.length) {
      heroTrack.innerHTML = "<div class='hero-slide'><div class='hero-caption'><h2>LB jewelry</h2></div></div>";
    }
  });
