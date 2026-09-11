const STORE_WHATSAPP_URL = "https://wa.me/5548996363634?text=Ol%C3%A1%2C%20quero%20mais%20informa%C3%A7%C3%B5es.";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function productHref(id) {
  const href = `produto?id=${encodeURIComponent(id)}`;
  if (window.location.protocol === "file:") {
    return href.replace("produto?", "produto.html?");
  }
  return href;
}

function isPromoProduct(product) {
  return product.badge === "sale"
    || Boolean(product.priceList && product.priceList > product.priceMax);
}

function hasSalePrice(product) {
  return Boolean(product.priceList && product.priceList > product.priceMax);
}

function productPriceHtml(product) {
  const hasRange = product.priceMin !== product.priceMax;
  if (hasSalePrice(product)) {
    return `
      <p class="product-price product-price--promo">
        <span class="product-price-old">${formatPrice(product.priceList)}</span>
        <span class="product-price-current">${formatPrice(product.priceMin)}${hasRange ? ` — ${formatPrice(product.priceMax)}` : ""}</span>
      </p>`;
  }
  return `<p class="product-price">${formatPrice(product.priceMin)}${hasRange ? ` — ${formatPrice(product.priceMax)}` : ""}</p>`;
}

function productCardHtml(product) {
  const isPromo = isPromoProduct(product);
  const badge = product.badge === "new"
    ? `<span class="product-badge new">LANÇAMENTO</span>`
    : isPromo
      ? `<span class="product-badge sale">SALE</span>`
      : "";
  const cover = product.image || product.images?.[0] || "";
  const hover = (product.images || []).find((src) => src && src !== cover) || "";
  const href = productHref(product.id);

  return `
    <article class="product-card${isPromo ? " product-card--promo" : ""}">
      <a class="product-card-link" href="${href}">
        <div class="product-card-image">
          ${badge}
          ${cover ? `<img class="product-image-main" src="${escapeHtml(cover)}" alt="${escapeHtml(product.name)}">` : ""}
          ${hover ? `<img class="product-image-hover" src="${escapeHtml(hover)}" alt="">` : ""}
        </div>
        <div class="product-card-body">
          <p class="product-category">${escapeHtml(product.category || "")}</p>
          <h3 class="product-name">${escapeHtml(product.name)}</h3>
          ${productPriceHtml(product)}
        </div>
      </a>
      <a class="product-cta" href="${href}">VER MAIS</a>
    </article>`;
}

async function fetchCatalog() {
  const response = await fetch("/api/catalog", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    throw new Error("Catálogo indisponível");
  }
  return response.json();
}
