(function () {
  if (window.location.protocol === "file:" && !window.location.pathname.endsWith("produto.html")) {
    const query = window.location.search || window.location.hash.replace(/^#/, "?");
    window.location.replace(`produto.html${query}`);
    return;
  }

  const root = document.getElementById("pdp-root");
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("id");

  function notFound() {
    root.innerHTML = `
      <div class="container pdp-not-found">
        <h1>Peça não encontrada</h1>
        <p>Ela pode ter sido vendida. Veja as outras peças da loja.</p>
        <a class="btn btn-dark pdp-back-link" href="/">Voltar para a loja</a>
      </div>`;
  }

  const ICONS = {
    gem: '<path d="M6.5 4h11L21 9l-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    chat: '<path d="M5 18.5 6 15a7 7 0 1 1 3 3z"/>'
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  function whatsappHref(product, price) {
    const text = `Olá! Tenho interesse na peça ${product.name} (${price}) que vi no site.`;
    return `https://wa.me/5548996363634?text=${encodeURIComponent(text)}`;
  }

  function render(product, related) {
    document.title = `${product.name} | LB18k`;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) descriptionMeta.content = product.description || `${product.name}, em ouro 18k.`;

    const displayPrice = product.priceMax;
    const hasSale = Boolean(product.priceList && product.priceList > product.priceMax);
    const hasRange = product.priceMin !== product.priceMax;
    const priceText = hasRange ? `${formatPrice(product.priceMin)} a ${formatPrice(product.priceMax)}` : formatPrice(displayPrice);
    const variants = (product.thickness || []).filter((value) => value && value !== "Único");
    const variantLabel = product.categorySlug === "aneis" ? "Numeração" : "Espessura aprox.";
    const images = (product.images?.length ? product.images : [product.image]).filter(Boolean);
    const galleryLabel = (index) => ["Peça", "Mostruário", "Em uso"][index] || `Foto ${index + 1}`;
    const detailLines = (product.details || []).filter((item) => item && !/importado do vendafácil|venda importada/i.test(item));
    const available = Number(product.stock) > 0;

    root.innerHTML = `
      <div class="container">
        <nav class="pdp-breadcrumb" aria-label="Caminho">
          <a href="/">LB18k</a>
          <span aria-hidden="true">/</span>
          <a href="/#${escapeHtml(product.categorySlug)}">${escapeHtml(product.category)}</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">${escapeHtml(product.name)}</span>
        </nav>

        <div class="pdp-grid">
          <section class="pdp-gallery" aria-label="Fotos da peça">
            <div class="pdp-main-image">
              <img id="pdp-main-img" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(product.name)}">
            </div>
            ${images.length > 1 ? `
            <div class="pdp-thumbs">
              ${images.map((src, index) => `
                <button type="button" class="pdp-thumb${index === 0 ? " is-active" : ""}" data-image="${escapeHtml(src)}" aria-label="${escapeHtml(galleryLabel(index))}">
                  <img src="${escapeHtml(src)}" alt="">
                  <span>${escapeHtml(galleryLabel(index))}</span>
                </button>
              `).join("")}
            </div>` : ""}
          </section>

          <section class="pdp-info">
            <div class="pdp-head">
              <span class="kicker">${escapeHtml(product.category)} · ouro 18k${product.badge ? ` <span class="pdp-badge pdp-badge--${escapeHtml(product.badge)}">${product.badge === "sale" ? "Oferta" : "Novidade"}</span>` : ""}</span>
              <h1 class="pdp-title">${escapeHtml(product.name)}</h1>
            </div>

            <div class="pdp-price-block">
              ${hasSale ? `<span class="pdp-price-old">${formatPrice(product.priceList)}</span>` : ""}
              <span class="pdp-price-current">${priceText}</span>
              ${available ? "" : `<p class="pdp-stock-note">Peça indisponível no momento.</p>`}
            </div>

            ${variants.length ? `
            <div class="pdp-variant">
              <span class="pdp-variant-label">${variantLabel}</span>
              <div class="pdp-variant-options">
                ${variants.map((value, index) => `
                  <button type="button" class="pdp-variant-btn${index === 0 ? " is-active" : ""}">${escapeHtml(value)}</button>
                `).join("")}
              </div>
            </div>` : ""}

            <a class="btn btn-wa" href="${whatsappHref(product, priceText)}" target="_blank" rel="noopener noreferrer">${icon("chat")}${available ? "Comprar pelo WhatsApp" : "Perguntar pelo WhatsApp"}</a>

            <div class="assure">
              <div>${icon("gem")}Ouro 18k</div>
              ${images.length > 1 ? `<div>${icon("camera")}Fotos reais desta peça</div>` : ""}
              <div>${icon("chat")}Tire dúvidas com a loja antes de comprar</div>
            </div>

            ${product.description || detailLines.length ? `
            <div class="pdp-details">
              <h2>Detalhes</h2>
              ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
              ${detailLines.length ? `<ul>${detailLines.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
            </div>` : ""}
          </section>
        </div>

        ${related.length ? `
        <section class="pdp-related">
          <div class="sec-title"><h2>Você também pode gostar</h2></div>
          <div class="product-grid">
            ${related.map(productCardHtml).join("")}
          </div>
        </section>` : ""}
      </div>`;

    const mainImg = document.getElementById("pdp-main-img");
    document.querySelectorAll(".pdp-thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        document.querySelectorAll(".pdp-thumb").forEach((btn) => btn.classList.remove("is-active"));
        thumb.classList.add("is-active");
        mainImg.src = thumb.dataset.image;
      });
    });

    document.querySelectorAll(".pdp-variant-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".pdp-variant-btn").forEach((item) => item.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
    });
  }

  if (!productId) {
    notFound();
    return;
  }

  fetchCatalog()
    .then((catalog) => {
      document.querySelectorAll("[data-category-link]").forEach((node) => {
        node.hidden = !catalog.products.some((item) => item.categorySlug === node.dataset.categoryLink && Number(item.stock) > 0 && item.showOnHome !== false);
      });
      const product = catalog.products.find((item) => item.id === productId);
      if (!product) {
        notFound();
        return;
      }
      const related = catalog.products
        .filter((item) => item.categorySlug === product.categorySlug && item.id !== product.id && Number(item.stock) > 0 && item.showOnHome !== false)
        .slice(0, 4);
      render(product, related);
    })
    .catch(notFound);
})();
