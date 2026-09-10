const heroTrack = document.querySelector(".hero-track");
const heroDots = document.querySelector(".hero-dots");
const track = document.querySelector(".chain-types-track");
const btnLeft = document.querySelector(".chain-types-arrow-left");
const btnRight = document.querySelector(".chain-types-arrow-right");

let currentSlide = 0;
let slideTimer;

function goToSlide(index, total) {
  if (!heroTrack) return;
  currentSlide = index;
  heroTrack.style.transform = `translateX(-${index * 100}%)`;
  document.querySelectorAll(".hero-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
  heroTrack.querySelectorAll("video").forEach((video, i) => {
    if (i === index) {
      video.play().catch(() => {});
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
  if (!heroTrack || !heroDots || !banners?.length) return;

  heroTrack.innerHTML = banners.map((banner) => {
    const label = escapeHtml(banner.alt || banner.title || "Banner");
    const media = banner.type === "video" && banner.video
      ? `<video src="${escapeHtml(banner.video)}" ${banner.image ? `poster="${escapeHtml(banner.image)}"` : ""} muted loop playsinline preload="metadata" aria-label="${label}"></video>`
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

  heroDots.innerHTML = banners.map((_, index) => `
    <button class="hero-dot${index === 0 ? " active" : ""}" type="button" aria-label="Slide ${index + 1}"></button>
  `).join("");

  const dots = document.querySelectorAll(".hero-dot");
  const total = banners.length;

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => goToSlide(index, total));
  });

  goToSlide(0, total);
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
