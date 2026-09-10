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

function productCardHtml(product) {
  const hasRange = product.priceMin !== product.priceMax;
  const badge = product.badge
    ? `<span class="product-badge ${escapeHtml(product.badge)}">${product.badge === "sale" ? "SALE" : "LANÇAMENTO"}</span>`
    : "";
  const cover = product.image || product.images?.[0] || "";
  const hover = (product.images || []).find((src) => src && src !== cover) || "";
  const href = productHref(product.id);

  return `
    <article class="product-card">
      <a class="product-card-link" href="${href}">
        <div class="product-card-image">
          ${badge}
          ${cover ? `<img class="product-image-main" src="${escapeHtml(cover)}" alt="${escapeHtml(product.name)}">` : ""}
          ${hover ? `<img class="product-image-hover" src="${escapeHtml(hover)}" alt="">` : ""}
        </div>
        <div class="product-card-body">
          <p class="product-category">${escapeHtml(product.category || "")}</p>
          <h3 class="product-name">${escapeHtml(product.name)}</h3>
          <p class="product-price">${formatPrice(product.priceMin)}${hasRange ? ` — ${formatPrice(product.priceMax)}` : ""}</p>
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
