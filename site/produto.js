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
        <h1>Produto não encontrado</h1>
        <p>O item que você procura não está disponível.</p>
        <a class="pdp-back-link" href="index.html">Voltar para a loja</a>
      </div>`;
  }

  function render(product, related) {
    document.title = `${product.name} | LB jewelry`;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) descriptionMeta.content = product.description;

    const displayPrice = product.priceList || product.priceMax;
    const hasSale = Boolean(product.priceList && product.priceList > product.priceMax);
    const hasRange = product.priceMin !== product.priceMax;
    const variantLabel = product.categorySlug === "aneis" ? "Numeração" : "Espessura aprox";
    const images = product.images?.length ? product.images : [product.image];

    root.innerHTML = `
      <div class="container">
        <nav class="pdp-breadcrumb" aria-label="Breadcrumb">
          <a href="index.html">LB jewelry</a>
          <span>/</span>
          <a href="index.html#${escapeHtml(product.categorySlug)}">${escapeHtml(product.category)}</a>
          <span>/</span>
          <span aria-current="page">${escapeHtml(product.name)}</span>
        </nav>

        <div class="pdp-grid">
          <section class="pdp-gallery" aria-label="Imagens do produto">
            <div class="pdp-main-image">
              <button class="pdp-favorite" type="button" aria-label="Favoritar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
              <img id="pdp-main-img" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}">
            </div>
            <div class="pdp-thumbs">
              ${images.map((src, index) => `
                <button type="button" class="pdp-thumb${index === 0 ? " is-active" : ""}" data-image="${escapeHtml(src)}" aria-label="Imagem ${index + 1}">
                  <img src="${escapeHtml(src)}" alt="">
                </button>
              `).join("")}
            </div>
          </section>

          <section class="pdp-info">
            <a class="pdp-collection" href="index.html#${escapeHtml(product.categorySlug)}">${escapeHtml(product.collection)}</a>
            ${product.badge ? `<span class="pdp-badge pdp-badge--${escapeHtml(product.badge)}">${product.badge === "sale" ? "SALE" : "LANÇAMENTO"}</span>` : ""}
            <h1 class="pdp-title">${escapeHtml(product.name)}</h1>

            <div class="pdp-price-block">
              ${hasSale ? `<span class="pdp-price-old">${formatPrice(product.priceList)}</span>` : ""}
              <span class="pdp-price-current">
                ${hasRange ? `${formatPrice(product.priceMin)} — ${formatPrice(product.priceMax)}` : formatPrice(displayPrice)}
              </span>
              ${Number(product.stock) <= 0 ? `<p class="pdp-stock-note">Peça indisponível no momento.</p>` : ""}
            </div>

            <div class="pdp-variant">
              <span class="pdp-variant-label">${variantLabel}</span>
              <div class="pdp-variant-options">
                ${(product.thickness || []).map((value, index) => `
                  <button type="button" class="pdp-variant-btn${index === 0 ? " is-active" : ""}">${escapeHtml(value)}</button>
                `).join("")}
              </div>
            </div>

            <button class="pdp-size-guide" type="button">Guia de tamanhos</button>
            <a class="pdp-add-cart" href="${STORE_WHATSAPP_URL}" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>

            <div class="pdp-accordions">
              <details class="pdp-accordion" open>
                <summary>Detalhes</summary>
                <div class="pdp-accordion-body">
                  <p>${escapeHtml(product.description)}</p>
                  <ul>${(product.details || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
                </div>
              </details>
              <details class="pdp-accordion">
                <summary>Certificação e Garantias</summary>
                <div class="pdp-accordion-body">
                  <ul>
                    <li>Certificado de Garantia LB jewelry</li>
                    <li>Embalagem para presente</li>
                    <li>Sustentabilidade: matéria-prima rastreada e certificada</li>
                  </ul>
                </div>
              </details>
              <details class="pdp-accordion">
                <summary>Troca e Devolução</summary>
                <div class="pdp-accordion-body">
                  <ul>
                    <li>Troca gratuita em até 30 dias</li>
                    <li>Devolução gratuita em até 7 dias após o recebimento</li>
                  </ul>
                </div>
              </details>
            </div>
          </section>
        </div>

        <section class="pdp-related">
          <h2>Você também pode gostar</h2>
          <div class="product-grid">
            ${related.map(productCardHtml).join("")}
          </div>
        </section>
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
      const product = catalog.products.find((item) => item.id === productId);
      if (!product) {
        notFound();
        return;
      }
      const related = catalog.products
        .filter((item) => item.categorySlug === product.categorySlug && item.id !== product.id)
        .slice(0, 4);
      render(product, related);
    })
    .catch(notFound);
})();
