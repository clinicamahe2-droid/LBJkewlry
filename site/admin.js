const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const productList = document.getElementById("product-list");
const bannerList = document.getElementById("banner-list");
const productDialog = document.getElementById("product-dialog");
const productForm = document.getElementById("product-form");
const productError = document.getElementById("product-error");
const productSearch = document.getElementById("product-search");
const stockSearch = document.getElementById("stock-search");

const CATEGORIES = [
  { slug: "correntes", label: "Correntes" },
  { slug: "brincos", label: "Brincos" },
  { slug: "pulseiras", label: "Pulseiras" },
  { slug: "aneis", label: "Anéis" }
];

let catalog = { products: [], banners: [], sales: [], clients: [], fiado: [], prospects: [], promoPopup: {} };
let productImages = [];
const listFilter = {
  products: { category: "all", lowStock: false, homeOnly: false, out: false, promoOnly: false },
  stock: { category: "all", lowStock: false, homeOnly: false, out: false, promoOnly: false }
};
const salesFilter = { period: "month", category: "all" };
const fiadoFilter = { status: "all" };
let clientSearchQuery = "";
let stockFocusId = null;
let lastSaleProductId = "";
let lastFiadoProductId = "";

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
  } catch {
    throw new Error("Servidor offline. Abra http://localhost:3480/admin");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir a ação.");
  }
  return data;
}

function showError(node, message) {
  node.hidden = !message;
  node.textContent = message || "";
}

function showPanel() {
  loginView.hidden = true;
  appView.hidden = false;
}

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

function phoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function whatsAppLink(phone, message) {
  const digits = phoneDigits(phone);
  if (!digits) return "";
  const normalized = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function fiadoCollectMessage(entry) {
  const lines = [
    `Olá ${entry.clientName}, tudo bem?`,
    "Passando para lembrar do seu fiado na LB jewelry.",
    `Produto: ${entry.productName}`,
    `Saldo em aberto: ${money(entry.balance)}`
  ];
  if (entry.nextDueDate) lines.push(`Vencimento: ${formatDate(entry.nextDueDate)}`);
  if (entry.installmentAmount) lines.push(`Parcela: ${money(entry.installmentAmount)}`);
  lines.push("Podemos combinar o pagamento?");
  return lines.join("\n");
}

function renderWhatsAppButton(entry, extraClass = "") {
  const href = whatsAppLink(entry.clientPhone, fiadoCollectMessage(entry));
  if (!href) return "";
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="whatsapp-btn ${extraClass}">WhatsApp</a>`;
}

function isDueSoon(entry) {
  if (!entry.nextDueDate || entry.status === "paid" || entry.status === "overdue") return false;
  const due = new Date(`${entry.nextDueDate}T12:00:00`);
  const limit = new Date();
  limit.setDate(limit.getDate() + 7);
  return due <= limit;
}

function getCollectionAlerts() {
  const openItems = (catalog.fiado || []).filter((item) => item.status !== "paid");
  return {
    overdue: openItems.filter((item) => item.status === "overdue"),
    dueSoon: openItems.filter(isDueSoon)
  };
}

function renderAlertItem(entry, tone) {
  const client = resolveFiadoClient(entry);
  const entryForContact = { ...entry, clientName: client.name, clientPhone: client.phone };
  return `
    <li class="fiado-alert-item is-${tone}">
      <div class="fiado-alert-copy">
        <strong>${text(client.name)}</strong>
        <span>${text(entry.productName)}</span>
        <span class="fiado-alert-balance">Saldo ${money(entry.balance)} · Venc. ${formatDate(entry.nextDueDate)}</span>
      </div>
      <div class="fiado-alert-actions">
        ${entry.clientId ? `<button type="button" data-edit-client="${text(entry.clientId)}">Editar</button>` : ""}
        ${renderWhatsAppButton(entryForContact, "whatsapp-btn--compact")}
      </div>
    </li>`;
}

function renderFiadoAlerts() {
  const container = document.getElementById("fiado-alerts");
  if (!container) return;
  const { overdue, dueSoon } = getCollectionAlerts();

  if (!overdue.length && !dueSoon.length) {
    container.innerHTML = `<p class="fiado-alert fiado-alert--ok">Nenhuma cobrança urgente no momento.</p>`;
    return;
  }

  container.innerHTML = [
    overdue.length ? `
      <section class="fiado-alert fiado-alert--overdue">
        <header>Cobrar agora · ${overdue.length} vencido${overdue.length === 1 ? "" : "s"}</header>
        <ul class="fiado-alert-list">${overdue.map((entry) => renderAlertItem(entry, "overdue")).join("")}</ul>
      </section>` : "",
    dueSoon.length ? `
      <section class="fiado-alert fiado-alert--due-soon">
        <header>Vence em até 7 dias · ${dueSoon.length}</header>
        <ul class="fiado-alert-list">${dueSoon.map((entry) => renderAlertItem(entry, "due-soon")).join("")}</ul>
      </section>` : ""
  ].join("");
}

function openClientById(clientId) {
  if (!clientId) return;
  openClient(catalog.clients.find((item) => item.id === clientId));
}

function renderFiadoPayments(payments, fiadoId) {
  if (!payments?.length) return "";
  const items = [...payments].reverse().map((pay) => `
    <li class="fiado-payment-item">
      <div class="fiado-payment-item-main">
        <span>${formatDate(pay.paidAt)}</span>
        <strong>${money(pay.amount)}</strong>
        ${pay.note ? `<em>${text(pay.note)}</em>` : ""}
      </div>
      <div class="fiado-payment-item-actions">
        <button type="button" data-edit-payment="${text(pay.id)}" data-fiado-id="${text(fiadoId)}">Editar</button>
        <button type="button" data-delete-payment="${text(pay.id)}" data-fiado-id="${text(fiadoId)}">Excluir</button>
      </div>
    </li>
  `).join("");
  return `
    <details class="fiado-payments"${payments.length <= 2 ? " open" : ""}>
      <summary>Abatimentos (${payments.length})</summary>
      <ul>${items}</ul>
    </details>`;
}

function resolveFiadoClient(entry) {
  const client = catalog.clients.find((item) => item.id === entry.clientId);
  return {
    name: client?.name || entry.clientName,
    phone: client?.phone || entry.clientPhone
  };
}

function renderFiadoCard(entry) {
  const payments = entry.payments || [];
  const client = resolveFiadoClient(entry);
  const entryForContact = { ...entry, clientName: client.name, clientPhone: client.phone };
  return `
    <article class="item-card fiado-card is-${text(entry.status)}">
      <div class="fiado-card-main">
        <header class="fiado-card-head">
          <span class="fiado-badge is-${text(entry.status)}">${fiadoStatusLabel(entry.status)}</span>
          ${entry.createdAt ? `<time class="fiado-card-date">${formatShortDate(entry.createdAt)}</time>` : ""}
        </header>
        <div class="fiado-card-info">
          <div class="fiado-card-block">
            <span class="fiado-card-label">Cliente</span>
            <strong>${text(client.name)}</strong>
            ${client.phone ? `<span class="fiado-card-sub">${text(client.phone)}</span>` : ""}
          </div>
          <div class="fiado-card-block">
            <span class="fiado-card-label">Produto</span>
            <p>${text(entry.productName)}</p>
            <span class="fiado-card-sub">${entry.quantity} un. · Total ${money(entry.total)}</span>
          </div>
        </div>
        <dl class="fiado-financials">
          <div>
            <dt>Pago</dt>
            <dd>${money(entry.paid)}</dd>
          </div>
          <div>
            <dt>Saldo</dt>
            <dd class="is-balance">${money(entry.balance)}</dd>
          </div>
          <div>
            <dt>Próximo venc.</dt>
            <dd>${formatDate(entry.nextDueDate)}</dd>
          </div>
          ${entry.installmentAmount ? `
          <div>
            <dt>Parcela</dt>
            <dd>${money(entry.installmentAmount)}</dd>
          </div>` : ""}
        </dl>
        ${entry.notes ? `<p class="fiado-notes">${text(entry.notes)}</p>` : ""}
        ${renderFiadoPayments(payments, entry.id)}
      </div>
      <div class="fiado-actions">
        <button type="button" data-edit-fiado="${text(entry.id)}">Editar fiado</button>
        ${entry.clientId ? `<button type="button" data-edit-client="${text(entry.clientId)}">Editar cliente</button>` : ""}
        ${entry.status !== "paid" ? renderWhatsAppButton(entryForContact) : ""}
        ${entry.status !== "paid" ? `<button type="button" data-pay-fiado="${text(entry.id)}" class="primary">Abatimento</button>` : ""}
      </div>
    </article>`;
}

function isSalesListRow(sale) {
  return !sale.type || sale.type === "cash" || sale.type === "fiado" || sale.type === "fiado_payment";
}

function saleRevenueAmount(sale) {
  if (sale.type === "fiado") return Number(sale.paidAtSale || 0);
  return Number(sale.total || 0);
}

function resolveSaleClient(sale) {
  if (!sale.clientId) return sale.clientName || "";
  const client = catalog.clients.find((item) => item.id === sale.clientId);
  return client?.name || sale.clientName || "";
}

function saleLabel(sale) {
  if (sale.type === "fiado") return "Fiado";
  if (sale.type === "fiado_payment") return "Abatimento";
  return "À vista";
}

function text(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = `${item.name} ${item.category} ${item.collection || ""} ${item.id}`.toLowerCase();
  return haystack.includes(query);
}

function filterItems(query, { category = "all", lowStock = false, homeOnly = false, out = false, promoOnly = false } = {}) {
  return catalog.products.filter((item) => {
    if (category !== "all" && item.categorySlug !== category) return false;
    if (lowStock && (item.stock ?? 0) > 2) return false;
    if (out && (item.stock ?? 0) > 0) return false;
    if (homeOnly && item.showOnHome === false) return false;
    if (promoOnly && !isPromoProduct(item)) return false;
    return matchesQuery(item, query);
  });
}

function groupByCategory(items) {
  return CATEGORIES
    .map((cat) => ({
      ...cat,
      items: items.filter((item) => item.categorySlug === cat.slug)
    }))
    .filter((group) => group.items.length);
}

function renderFilterChips(containerId, state) {
  const node = document.getElementById(containerId);
  if (!node) return;
  const low = catalog.products.filter((item) => (item.stock ?? 0) <= 2).length;
  const out = catalog.products.filter((item) => (item.stock ?? 0) <= 0).length;
  const home = catalog.products.filter((item) => item.showOnHome !== false).length;
  const promo = catalog.products.filter((item) => isPromoProduct(item)).length;
  node.innerHTML = `
    <button type="button" data-cat="all" class="${state.category === "all" ? "is-active" : ""}">
      Todas <span>${catalog.products.length}</span>
    </button>
    ${CATEGORIES.map((cat) => {
      const count = catalog.products.filter((item) => item.categorySlug === cat.slug).length;
      return `
        <button type="button" data-cat="${cat.slug}" class="${state.category === cat.slug ? "is-active" : ""}">
          ${cat.label} <span>${count}</span>
        </button>`;
    }).join("")}
    <button type="button" data-promo class="filter-chip--promo ${state.promoOnly ? "is-active" : ""}">
      Promoção <span>${promo}</span>
    </button>
    <button type="button" data-low class="${state.lowStock ? "is-active" : ""}">
      Baixo <span>${low}</span>
    </button>
    <button type="button" data-out class="${state.out ? "is-active" : ""}">
      Zerado <span>${out}</span>
    </button>
    <button type="button" data-home class="${state.homeOnly ? "is-active" : ""}">
      Na home <span>${home}</span>
    </button>`;
}

function bindFilterBar(containerId, key, redraw) {
  document.getElementById(containerId).addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if ("low" in button.dataset) {
      listFilter[key].lowStock = !listFilter[key].lowStock;
      if (listFilter[key].lowStock) listFilter[key].out = false;
    } else if ("out" in button.dataset) {
      listFilter[key].out = !listFilter[key].out;
      if (listFilter[key].out) listFilter[key].lowStock = false;
    } else if ("home" in button.dataset) {
      listFilter[key].homeOnly = !listFilter[key].homeOnly;
    } else if ("promo" in button.dataset) {
      listFilter[key].promoOnly = !listFilter[key].promoOnly;
    } else if (button.dataset.cat) {
      listFilter[key].category = button.dataset.cat;
    }
    redraw();
  });
}

function last12Months() {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const now = new Date();
  const months = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: `${labels[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`,
      total: 0,
      count: 0
    });
  }
  return months;
}

function renderMonthChart(sales) {
  const months = last12Months();
  sales.forEach((sale) => {
    const key = (sale.createdAt || "").slice(0, 7);
    const bucket = months.find((item) => item.key === key);
    if (bucket) {
      bucket.total += Number(sale.total) || 0;
      bucket.count += 1;
    }
  });
  const max = Math.max(...months.map((item) => item.total), 1);
  document.getElementById("chart-months").innerHTML = months.map((item) => `
    <div class="cat-row">
      <span>${item.label}</span>
      <div class="cat-track"><div class="cat-fill" style="width:${(item.total / max) * 100}%"></div></div>
      <strong>${item.total ? money(item.total) : "—"}</strong>
    </div>
  `).join("");
}

function renderCategoryChart(sales) {
  const totals = {};
  sales.forEach((sale) => {
    const product = catalog.products.find((item) => item.id === sale.productId);
    const category = product?.category || "Outros";
    totals[category] = (totals[category] || 0) + (Number(sale.total) || 0);
  });
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map((item) => item[1]), 1);
  document.getElementById("chart-categories").innerHTML = rows.length
    ? rows.map(([label, total]) => `
        <div class="cat-row">
          <span>${label}</span>
          <div class="cat-track"><div class="cat-fill" style="width:${(total / max) * 100}%"></div></div>
          <strong>${money(total)}</strong>
        </div>
      `).join("")
    : "<p class='panel-hint'>Registre vendas para ver o gráfico.</p>";
}

function renderPhotoPreviews() {
  const box = document.getElementById("product-previews");
  if (!productImages.length) {
    box.innerHTML = "<p class='panel-hint'>Nenhuma foto ainda. A primeira será a da home.</p>";
    productForm.elements.image.value = "";
    return;
  }
  box.innerHTML = productImages.map((src, index) => `
    <figure class="photo-thumb${index === 0 ? " is-cover" : ""}">
      <img src="${src}" alt="">
      <figcaption>${index === 0 ? "Home" : `Foto ${index + 1}`}</figcaption>
      <button type="button" data-remove-photo="${index}">Remover</button>
    </figure>
  `).join("");
  productForm.elements.image.value = productImages[0];
}

function productMeta(item) {
  const price = hasSalePrice(item)
    ? `<span class="promo-price">${money(item.priceList)} → ${money(item.priceMax)}</span>`
    : `${money(item.priceMin)}${item.priceMin !== item.priceMax ? ` — ${money(item.priceMax)}` : ""}`;
  const stockClass = item.stock <= 2 ? "stock-low" : "";
  const promoTag = isPromoProduct(item) ? ' · <span class="promo-tag">Promoção</span>' : "";
  return `${price} · <span class="${stockClass}">${item.stock ?? 0} un.</span> · ${item.showOnHome ? "Na home" : "Fora da home"}${promoTag}`;
}

function promoDiscountLabel(item) {
  if (!hasSalePrice(item)) return "";
  const pct = Math.round((1 - item.priceMax / item.priceList) * 100);
  return pct > 0 ? ` (−${pct}%)` : "";
}

function renderPromoProducts() {
  const list = document.getElementById("promo-product-list");
  const count = document.getElementById("promo-count");
  if (!list) return;

  const promos = catalog.products.filter((item) => isPromoProduct(item));
  if (count) {
    count.textContent = promos.length
      ? `${promos.length} peça${promos.length === 1 ? "" : "s"}`
      : "Nenhuma";
  }

  if (!promos.length) {
    list.innerHTML = "<p class='panel-hint promo-empty'>Nenhum item em promoção no momento.</p>";
    return;
  }

  list.innerHTML = promos.map((item) => `
    <article class="item-card item-card--promo">
      <img class="thumb" src="${text(item.image)}" alt="">
      <div class="item-card-body">
        <h4>${text(item.name)}</h4>
        <p>
          ${hasSalePrice(item)
            ? `<span class="promo-price">${money(item.priceList)} → ${money(item.priceMax)}${promoDiscountLabel(item)}</span>`
            : `<span class="promo-price">${money(item.priceMax)}</span>`}
          · ${text(item.category || "")}
          ${item.badge === "sale" ? ' · <span class="promo-tag">Selo Sale</span>' : ""}
        </p>
      </div>
      <div class="item-card-actions">
        <button type="button" data-edit="${text(item.id)}">Editar</button>
      </div>
    </article>
  `).join("");
}

function renderProducts() {
  const query = productSearch.value.trim().toLowerCase();
  const rows = filterItems(query, listFilter.products);
  renderFilterChips("product-filters", listFilter.products);
  const meta = document.getElementById("product-result-meta");
  meta.textContent = rows.length
    ? `${rows.length} peça${rows.length === 1 ? "" : "s"} nesta visão`
    : "";

  if (!rows.length) {
    productList.innerHTML = "<p class='panel-hint'>Nenhum produto encontrado neste filtro.</p>";
    return;
  }

  const groups = groupByCategory(rows);
  productList.innerHTML = groups.map((group) => `
    <section class="category-block">
      <header class="category-block-head">
        <h3>${group.label}</h3>
        <span>${group.items.length} ${group.items.length === 1 ? "peça" : "peças"}</span>
      </header>
      <div class="item-list">
        ${group.items.map((item) => `
          <article class="item-card${isPromoProduct(item) ? " item-card--promo" : ""}">
            <img class="thumb" src="${text(item.image)}" alt="">
            <div class="item-card-body">
              <h4>${text(item.name)}</h4>
              <p>${productMeta(item)}</p>
            </div>
            <div class="item-card-actions">
              <button type="button" data-edit="${text(item.id)}">Editar</button>
              <button type="button" data-delete="${text(item.id)}">Excluir</button>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function fillSaleProducts(selectedId) {
  const select = document.querySelector("#sale-form [name='productId']");
  const category = document.getElementById("sale-category").value || "all";
  const rows = filterItems("", { category });
  const groups = groupByCategory(rows);
  select.innerHTML = groups.map((group) => `
    <optgroup label="${group.label}">
      ${group.items.map((item) => `
        <option value="${text(item.id)}" data-price="${item.priceMin}" ${item.id === selectedId ? "selected" : ""}>
          ${text(item.name)} (${item.stock} un.)
        </option>
      `).join("")}
    </optgroup>
  `).join("") || `<option value="">Nenhuma peça nesta categoria</option>`;

  const chosen = select.selectedOptions[0];
  if (chosen?.dataset.price) {
    document.querySelector("#sale-form [name='unitPrice']").value = chosen.dataset.price;
  }
}

function bannerMedia(banner) {
  if (banner.type === "video" && banner.video) {
    return `<video src="${text(banner.video)}" muted playsinline></video>`;
  }
  if (banner.image) {
    return `<img src="${text(banner.image)}" alt="">`;
  }
  return `<div class="banner-placeholder">Sem mídia</div>`;
}

function renderPromoPopupSettings() {
  const popup = catalog.promoPopup || {};
  const enabled = document.getElementById("promo-enabled");
  const coupon = document.getElementById("promo-coupon-code");
  const seller = document.getElementById("promo-seller-phone");
  const headline = document.getElementById("promo-headline");
  const instruction = document.getElementById("promo-instruction");
  const imageHidden = document.getElementById("promo-image");
  const imageUrl = document.getElementById("promo-image-url");
  const preview = document.getElementById("promo-image-preview");
  if (!enabled) return;
  enabled.checked = popup.enabled !== false;
  coupon.value = popup.couponCode || "";
  seller.value = popup.sellerPhone || "";
  headline.value = popup.headline || "";
  instruction.value = popup.instruction || "";
  imageHidden.value = popup.image || "";
  imageUrl.value = popup.image || "";
  if (preview) {
    preview.src = popup.image || "";
    preview.hidden = !popup.image;
  }
}

function collectPromoPopup() {
  return {
    enabled: document.getElementById("promo-enabled").checked,
    couponCode: document.getElementById("promo-coupon-code").value.trim(),
    sellerPhone: document.getElementById("promo-seller-phone").value.trim(),
    headline: document.getElementById("promo-headline").value.trim(),
    instruction: document.getElementById("promo-instruction").value.trim(),
    image: document.getElementById("promo-image-url").value.trim()
      || document.getElementById("promo-image").value.trim()
  };
}

function formatPhoneDisplay(phone) {
  const digits = phoneDigits(phone);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone || "—";
}

function prospectInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "?";
}

function renderProspects() {
  const list = document.getElementById("prospect-list");
  const count = document.getElementById("prospects-count");
  if (!list) return;
  const rows = catalog.prospects || [];
  if (count) {
    count.textContent = String(rows.length);
  }
  if (!rows.length) {
    list.innerHTML = `
      <div class="prospects-empty">
        <strong>Nenhum prospect ainda</strong>
        <p>Os cadastros do pop-up de cupom aparecem aqui.</p>
      </div>`;
    return;
  }
  list.innerHTML = `
    <div class="prospect-table-head" aria-hidden="true">
      <span>Cliente</span>
      <span>WhatsApp</span>
      <span>Cupom</span>
      <span>Data</span>
      <span></span>
    </div>
    ${rows.map((item) => {
      const waHref = whatsAppLink(item.phone, `Olá ${item.name}, vi seu cadastro no cupom ${item.couponCode} da LB jewelry.`);
      return `
        <article class="prospect-row">
          <div class="prospect-identity">
            <span class="prospect-avatar">${text(prospectInitials(item.name))}</span>
            <div class="prospect-identity-text">
              <h4>${text(item.name)}</h4>
              <p class="prospect-phone-mobile">${text(formatPhoneDisplay(item.phone))}</p>
            </div>
          </div>
          <p class="prospect-phone">${text(formatPhoneDisplay(item.phone))}</p>
          <p><span class="prospect-coupon">${text(item.couponCode)}</span></p>
          <p class="prospect-date">${formatShortDate(item.createdAt) || formatDate(item.createdAt)}</p>
          <div class="prospect-actions">
            ${waHref ? `<a href="${waHref}" target="_blank" rel="noopener noreferrer" class="whatsapp-btn whatsapp-btn--compact">WhatsApp</a>` : ""}
            <button type="button" class="prospect-delete" data-delete-prospect="${text(item.id)}">Excluir</button>
          </div>
        </article>`;
    }).join("")}`;
}

function renderBanners() {
  bannerList.innerHTML = catalog.banners.map((banner, index) => `
    <article class="banner-card" data-index="${index}">
      <div class="banner-preview">${bannerMedia(banner)}</div>
      <div>
        <input type="hidden" data-field="id" value="${text(banner.id || "")}">
        <label>Tipo
          <select data-field="type">
            <option value="image" ${banner.type !== "video" ? "selected" : ""}>Imagem</option>
            <option value="video" ${banner.type === "video" ? "selected" : ""}>Vídeo</option>
          </select>
        </label>
        <label>Título<input type="text" data-field="title" value="${text(banner.title || "")}"></label>
        <input type="hidden" data-field="image" value="${text(banner.image || "")}">
        <input type="hidden" data-field="video" value="${text(banner.video || "")}">
        <label>Link do arquivo (opcional)
          <input type="text" data-field="media-url" value="${text(banner.type === "video" ? banner.video : banner.image)}" placeholder="assets/uploads/arquivo.mp4 ou https://...">
        </label>
        <label class="file-label">Trocar arquivo
          <input type="file" data-upload accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">
        </label>
        <p class="panel-hint banner-file-hint">Vídeos: até 50 MB. Se o vídeo atual já funciona na loja, não precisa reenviar — só clique em Salvar banners.</p>
      </div>
      <div class="row-actions">
        <button type="button" data-move="up">Subir</button>
        <button type="button" data-move="down">Descer</button>
        <button type="button" data-remove>Remover</button>
      </div>
    </article>
  `).join("");
}

function renderStock() {
  const totalUnits = catalog.products.reduce((sum, item) => sum + (item.stock || 0), 0);
  const low = catalog.products.filter((item) => item.stock <= 2).length;
  document.getElementById("stock-summary").innerHTML = `
    <div class="stat-card"><span>Peças em estoque</span><strong>${totalUnits}</strong></div>
    <div class="stat-card"><span>Produtos cadastrados</span><strong>${catalog.products.length}</strong></div>
    <div class="stat-card"><span>Estoque baixo</span><strong>${low}</strong></div>
  `;

  const query = stockSearch.value.trim().toLowerCase();
  const rows = filterItems(query, listFilter.stock);
  renderFilterChips("stock-filters", listFilter.stock);
  document.getElementById("stock-result-meta").textContent = rows.length
    ? `${rows.length} peça${rows.length === 1 ? "" : "s"} nesta visão`
    : "";

  if (!rows.length) {
    document.getElementById("stock-list").innerHTML = "<p class='panel-hint'>Nenhuma peça neste filtro. Ajuste a busca ou a categoria.</p>";
    return;
  }

  const groups = groupByCategory(rows);
  document.getElementById("stock-list").innerHTML = groups.map((group) => `
    <section class="category-block">
      <header class="category-block-head">
        <h3>${group.label}</h3>
        <span>${group.items.length} ${group.items.length === 1 ? "peça" : "peças"}</span>
      </header>
      <div class="item-list">
        ${group.items.map((item) => `
          <article class="item-card stock-card">
            <div class="item-card-body">
              <h4>${text(item.name)}</h4>
              <p>
                <span class="${item.stock <= 2 ? "stock-low" : ""}">${item.stock ?? 0} un.</span>
                · ${item.showOnHome ? "Na home" : "Fora da home"}
              </p>
            </div>
            <button type="button" data-edit-stock="${text(item.id)}">Editar</button>
            <form class="stock-entry" data-stock="${text(item.id)}">
              <button type="button" data-step="-1" aria-label="Diminuir">−</button>
              <input type="number" name="quantity" min="1" step="1" value="1" required>
              <button type="button" data-step="1" aria-label="Aumentar">+</button>
              <button type="submit">Repor</button>
            </form>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  if (stockFocusId) {
    const input = document.querySelector(`form[data-stock="${stockFocusId}"] input[name="quantity"]`);
    input?.focus();
    input?.select();
    stockFocusId = null;
  }
}

function saleMatchesPeriod(sale) {
  const created = new Date(sale.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const now = new Date();
  if (salesFilter.period === "all") return true;
  if (salesFilter.period === "month") {
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }
  if (salesFilter.period === "quarter") {
    const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return created >= start;
  }
  return created.getFullYear() === now.getFullYear();
}

function filteredSales() {
  return (catalog.sales || []).filter((sale) => {
    if (!isSalesListRow(sale)) return false;
    if (!saleMatchesPeriod(sale)) return false;
    if (salesFilter.category === "all") return true;
    const product = catalog.products.find((item) => item.id === sale.productId);
    return product?.categorySlug === salesFilter.category;
  });
}

function renderSalesFilters() {
  const periods = [
    { id: "month", label: "Este mês" },
    { id: "quarter", label: "Trimestre" },
    { id: "year", label: "Ano" },
    { id: "all", label: "Tudo" }
  ];
  document.getElementById("sales-period-filters").innerHTML = periods.map((item) => `
    <button type="button" data-period="${item.id}" class="${salesFilter.period === item.id ? "is-active" : ""}">${item.label}</button>
  `).join("");
  document.getElementById("sales-category-filters").innerHTML = `
    <button type="button" data-sale-cat="all" class="${salesFilter.category === "all" ? "is-active" : ""}">Todas</button>
    ${CATEGORIES.map((cat) => `
      <button type="button" data-sale-cat="${cat.slug}" class="${salesFilter.category === cat.slug ? "is-active" : ""}">${cat.label}</button>
    `).join("")}
  `;
}

function renderSales() {
  renderSalesFilters();
  const rows = filteredSales();
  const total = rows.reduce((sum, item) => sum + saleRevenueAmount(item), 0);
  const units = rows.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const ticket = rows.length ? total / rows.length : 0;
  document.getElementById("sales-summary").innerHTML = `
    <div class="stat-card"><span>Faturamento</span><strong>${money(total)}</strong></div>
    <div class="stat-card"><span>Peças vendidas</span><strong>${units}</strong></div>
    <div class="stat-card"><span>Ticket médio</span><strong>${money(ticket)}</strong></div>
  `;
  const meta = document.getElementById("sales-result-meta");
  if (meta) {
    meta.textContent = rows.length
      ? `${rows.length} venda${rows.length === 1 ? "" : "s"} neste filtro`
      : "Nenhuma venda neste filtro.";
  }
  renderMonthChart(rows);
  renderCategoryChart(rows);

  fillSaleProducts(lastSaleProductId);
  document.getElementById("sales-list").innerHTML = rows.length ? `
    <div class="item-list">
      ${rows.map((item) => {
        const badge = saleLabel(item);
        const clientName = resolveSaleClient(item);
        const amount = saleRevenueAmount(item);
        return `
        <article class="item-card sale-card sale-card--${text(item.type || "cash")}">
          <div class="item-card-body">
            <span class="sale-badge">${badge}</span>
            <h4>${text(item.productName || "Recebimento")}</h4>
            <p>${new Date(item.createdAt).toLocaleString("pt-BR")}${item.quantity ? ` · ${item.quantity} un.` : ""}${clientName ? ` · Cliente: <strong>${text(clientName)}</strong>` : ""}</p>
            ${item.type === "fiado" && Number(item.total || 0) > amount ? `<p class="sale-meta">Total da venda: ${money(item.total)} · Entrada: ${money(amount)}</p>` : ""}
          </div>
          <strong class="sale-total">${money(amount)}</strong>
        </article>`;
      }).join("")}
    </div>` : "<p class='panel-hint'>Nenhuma venda neste filtro.</p>";
}

function fillFiadoProducts(selectedId) {
  const select = document.querySelector("#fiado-form [name='productId']");
  const category = document.getElementById("fiado-category").value || "all";
  const rows = filterItems("", { category });
  const groups = groupByCategory(rows);
  select.innerHTML = groups.map((group) => `
    <optgroup label="${group.label}">
      ${group.items.map((item) => `
        <option value="${text(item.id)}" data-price="${item.priceMin}" ${item.id === selectedId ? "selected" : ""}>
          ${text(item.name)} (${item.stock} un.)
        </option>
      `).join("")}
    </optgroup>
  `).join("") || `<option value="">Nenhuma peça nesta categoria</option>`;

  const chosen = select.selectedOptions[0];
  if (chosen?.dataset.price) {
    document.querySelector("#fiado-form [name='unitPrice']").value = chosen.dataset.price;
  }
}

function fillClientSelects() {
  const options = (catalog.clients || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((client) => `<option value="${text(client.id)}">${text(client.name)} · ${text(client.phone)}</option>`)
    .join("");
  const fiadoSelect = document.querySelector("#fiado-form [name='clientId']");
  if (fiadoSelect) {
    fiadoSelect.innerHTML = options || `<option value="">Cadastre um cliente</option>`;
  }
}

function filteredClients() {
  const query = clientSearchQuery.trim().toLowerCase();
  return (catalog.clients || []).filter((client) => {
    if (!query) return true;
    return `${client.name} ${client.phone} ${client.notes || ""}`.toLowerCase().includes(query);
  });
}

function filteredFiado() {
  return (catalog.fiado || []).filter((entry) => {
    if (fiadoFilter.status === "all") return true;
    return entry.status === fiadoFilter.status;
  });
}

function fiadoStatusLabel(status) {
  if (status === "paid") return "Quitado";
  if (status === "overdue") return "Vencido";
  return "Em aberto";
}

function renderClients() {
  const rows = filteredClients();
  const list = document.getElementById("client-list");
  if (!list) return;
  list.innerHTML = rows.length ? rows.map((client) => {
    const openCount = (catalog.fiado || []).filter((item) => item.clientId === client.id && item.status !== "paid").length;
    return `
      <article class="item-card">
        <div class="item-card-body">
          <h4>${text(client.name)}</h4>
          <p>${text(client.phone)}${openCount ? ` · ${openCount} fiado${openCount === 1 ? "" : "s"} aberto${openCount === 1 ? "" : "s"}` : ""}</p>
        </div>
        <div class="item-card-actions">
          <button type="button" data-edit-client="${text(client.id)}">Editar</button>
          <button type="button" data-delete-client="${text(client.id)}">Excluir</button>
        </div>
      </article>`;
  }).join("") : "<p class='panel-hint'>Nenhum cliente cadastrado.</p>";
}

function renderFiadoFilters() {
  const filters = [
    { id: "all", label: "Todos" },
    { id: "open", label: "Em aberto" },
    { id: "overdue", label: "Vencidos" },
    { id: "paid", label: "Quitados" }
  ];
  document.getElementById("fiado-status-filters").innerHTML = filters.map((item) => `
    <button type="button" data-fiado-status="${item.id}" class="fiado-filter ${fiadoFilter.status === item.id ? "is-active" : ""}">${item.label}</button>
  `).join("");
}

function renderFiado() {
  const openItems = (catalog.fiado || []).filter((item) => item.status !== "paid");
  const overdueItems = openItems.filter((item) => item.status === "overdue");
  const dueSoon = openItems.filter((item) => {
    if (!item.nextDueDate || item.status === "overdue") return false;
    const due = new Date(`${item.nextDueDate}T12:00:00`);
    const limit = new Date();
    limit.setDate(limit.getDate() + 7);
    return due <= limit;
  });
  const receivable = openItems.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const receivedMonth = (catalog.fiado || []).reduce((sum, entry) => {
    const payments = (entry.payments || []).filter((pay) => (pay.paidAt || "").slice(0, 7) === monthKey);
    return sum + payments.reduce((acc, pay) => acc + Number(pay.amount || 0), 0);
  }, 0);

  document.getElementById("fiado-summary").innerHTML = `
    <div class="stat-card stat-card--receivable"><span>A receber</span><strong>${money(receivable)}</strong></div>
    <div class="stat-card stat-card--overdue"><span>Vencidos</span><strong>${overdueItems.length}</strong></div>
    <div class="stat-card stat-card--due-soon"><span>Vence em 7 dias</span><strong>${dueSoon.length}</strong></div>
    <div class="stat-card stat-card--received"><span>Recebido no mês</span><strong>${money(receivedMonth)}</strong></div>
  `;

  renderFiadoFilters();
  fillClientSelects();
  fillFiadoProducts(lastFiadoProductId);
  renderClients();

  const rows = filteredFiado();
  document.getElementById("fiado-result-meta").textContent = rows.length
    ? `${rows.length} fiado${rows.length === 1 ? "" : "s"} nesta visão`
    : "Nenhum fiado nesta visão.";

  renderFiadoAlerts();

  document.getElementById("fiado-list").innerHTML = rows.length
    ? rows.map((entry) => renderFiadoCard(entry)).join("")
    : "<p class='panel-hint'>Nenhum fiado registrado ainda.</p>";
}

function openClient(client) {
  const form = document.getElementById("client-form");
  form.reset();
  showError(document.getElementById("client-error"), "");
  document.getElementById("client-dialog-title").textContent = client ? "Editar cliente" : "Novo cliente";
  form.elements.id.value = client?.id || "";
  form.elements.name.value = client?.name || "";
  form.elements.phone.value = client?.phone || "";
  form.elements.notes.value = client?.notes || "";
  document.getElementById("client-dialog").showModal();
}

function fiadoPayloadFromEntry(entry, payments) {
  return {
    quantity: entry.quantity,
    unitPrice: entry.unitPrice,
    installmentAmount: entry.installmentAmount ?? 0,
    nextDueDate: entry.nextDueDate || "",
    notes: entry.notes || "",
    payments
  };
}

async function persistFiadoPayments(entry, payments) {
  return request(`/api/admin/fiado/${entry.id}`, {
    method: "PUT",
    body: JSON.stringify(fiadoPayloadFromEntry(entry, payments))
  });
}

function openPayment(entry) {
  const form = document.getElementById("payment-form");
  form.reset();
  showError(document.getElementById("payment-error"), "");
  document.getElementById("payment-dialog-title").textContent = "Registrar abatimento";
  document.getElementById("payment-submit-btn").textContent = "Confirmar abatimento";
  document.getElementById("payment-paid-at-wrap").hidden = true;
  document.getElementById("payment-next-due-wrap").hidden = false;
  form.elements.fiadoId.value = entry.id;
  form.elements.paymentId.value = "";
  form.elements.nextDueDate.value = entry.nextDueDate || "";
  document.getElementById("payment-summary").innerHTML = `
    <span class="payment-summary-label">Cliente</span>
    <strong>${text(entry.clientName)}</strong>
    <span class="payment-summary-label">Produto</span>
    <span>${text(entry.productName)}</span>
    <span class="payment-summary-label">Saldo atual</span>
    <strong class="payment-summary-balance">${money(entry.balance)}</strong>`;
  document.getElementById("payment-dialog").showModal();
}

function openPaymentEdit(entry, payment) {
  const form = document.getElementById("payment-form");
  form.reset();
  showError(document.getElementById("payment-error"), "");
  document.getElementById("payment-dialog-title").textContent = "Editar abatimento";
  document.getElementById("payment-submit-btn").textContent = "Salvar abatimento";
  document.getElementById("payment-paid-at-wrap").hidden = false;
  document.getElementById("payment-next-due-wrap").hidden = false;
  form.elements.fiadoId.value = entry.id;
  form.elements.paymentId.value = payment.id;
  form.elements.paidAt.value = payment.paidAt ? String(payment.paidAt).slice(0, 10) : "";
  form.elements.amount.value = Number(payment.amount || 0);
  form.elements.note.value = payment.note || "";
  form.elements.nextDueDate.value = entry.nextDueDate || "";
  document.getElementById("payment-summary").innerHTML = `
    <span class="payment-summary-label">Cliente</span>
    <strong>${text(entry.clientName)}</strong>
    <span class="payment-summary-label">Produto</span>
    <span>${text(entry.productName)}</span>
    <span class="payment-summary-label">Saldo atual</span>
    <strong class="payment-summary-balance">${money(entry.balance)}</strong>`;
  document.getElementById("payment-dialog").showModal();
}

function renderFiadoPaymentRow(payment = {}) {
  const paidDate = payment.paidAt
    ? String(payment.paidAt).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `
    <article class="fiado-payment-row">
      <input type="hidden" data-field="id" value="${text(payment.id || "")}">
      <label>Data<input type="date" data-field="paidAt" value="${paidDate}" required></label>
      <label>Valor<input type="number" data-field="amount" min="0.01" step="0.01" value="${Number(payment.amount || 0) || ""}" required></label>
      <label>Obs.<input type="text" data-field="note" value="${text(payment.note || "")}" placeholder="Ex.: PIX"></label>
      <button type="button" data-remove-payment-row>Remover</button>
    </article>`;
}

function renderFiadoPaymentEditor(payments = []) {
  const list = document.getElementById("fiado-payments-list");
  if (!list) return;
  list.innerHTML = payments.length
    ? payments.map((pay) => renderFiadoPaymentRow(pay)).join("")
    : "<p class='panel-hint'>Nenhum abatimento registrado.</p>";
}

function collectFiadoPaymentEditor() {
  return [...document.querySelectorAll("#fiado-payments-list .fiado-payment-row")].map((row) => ({
    id: row.querySelector('[data-field="id"]').value,
    paidAt: row.querySelector('[data-field="paidAt"]').value,
    amount: Number(row.querySelector('[data-field="amount"]').value),
    note: row.querySelector('[data-field="note"]').value
  }));
}

function updateFiadoEditTotals(form) {
  const quantity = Number(form.elements.quantity.value || 0);
  const unitPrice = Number(form.elements.unitPrice.value || 0);
  const total = quantity * unitPrice;
  const paid = collectFiadoPaymentEditor().reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  const balance = Math.max(0, total - paid);
  document.getElementById("fiado-edit-totals").innerHTML = `
    <span>Total: <strong>${money(total)}</strong></span>
    <span>Pago: <strong>${money(paid)}</strong></span>
    <span>Saldo: <strong class="payment-summary-balance">${money(balance)}</strong></span>`;
}

function openFiadoEdit(entry) {
  const form = document.getElementById("fiado-edit-form");
  form.reset();
  showError(document.getElementById("fiado-edit-error"), "");
  const client = resolveFiadoClient(entry);
  form.elements.id.value = entry.id;
  form.elements.quantity.value = entry.quantity;
  form.elements.unitPrice.value = entry.unitPrice;
  form.elements.installmentAmount.value = entry.installmentAmount ?? "";
  form.elements.nextDueDate.value = entry.nextDueDate || "";
  form.elements.notes.value = entry.notes || "";
  document.getElementById("fiado-edit-summary").innerHTML =
    `<strong>${text(client.name)}</strong> · ${text(entry.productName)}`;
  renderFiadoPaymentEditor(entry.payments || []);
  updateFiadoEditTotals(form);
  document.getElementById("fiado-edit-dialog").showModal();
}

async function loadCatalog() {
  catalog = await request("/api/admin/store");
  if (!Array.isArray(catalog.sales)) catalog.sales = [];
  if (!Array.isArray(catalog.clients)) catalog.clients = [];
  if (!Array.isArray(catalog.fiado)) catalog.fiado = [];
  if (!Array.isArray(catalog.prospects)) catalog.prospects = [];
  if (!catalog.promoPopup) catalog.promoPopup = {};
  renderPromoProducts();
  renderProducts();
  renderPromoPopupSettings();
  renderBanners();
  renderProspects();
  renderStock();
  renderSales();
  renderFiado();
}

function openProduct(product) {
  productForm.reset();
  showError(productError, "");
  document.getElementById("product-dialog-title").textContent = product ? "Editar produto" : "Novo produto";
  productForm.elements.id.value = product?.id || "";
  productForm.elements.name.value = product?.name || "";
  productForm.elements.categorySlug.value = product?.categorySlug || "correntes";
  productForm.elements.badge.value = product?.badge || "";
  productForm.elements.collection.value = product?.collection || "";
  productForm.elements.priceMin.value = product?.priceMin ?? "";
  productForm.elements.priceMax.value = product?.priceMax ?? "";
  productForm.elements.priceList.value = product?.priceList ?? "";
  productForm.elements.image.value = product?.image || "";
  productForm.elements.variants.value = (product?.thickness || []).join(", ");
  productForm.elements.description.value = product?.description || "";
  productForm.elements.detailsText.value = (product?.details || []).join("\n");
  productForm.elements.stock.value = product?.stock ?? 1;
  productForm.elements.showOnHome.checked = product ? product.showOnHome !== false : true;
  productImages = product?.images?.length ? [...product.images] : (product?.image ? [product.image] : []);
  renderPhotoPreviews();
  productDialog.showModal();
}

const MAX_BANNER_VIDEO_BYTES = 50 * 1024 * 1024;

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function uploadSizeError(file, maxBytes = MAX_BANNER_VIDEO_BYTES) {
  return `Arquivo ${formatFileSize(file.size)}. Máximo ${formatFileSize(maxBytes)}. Comprima o MP4 (720p) ou envie só o link abaixo.`;
}

function parseStorageError(raw) {
  const message = String(raw || "");
  if (/maximum allowed size|payload too large|entity too large/i.test(message)) {
    return `Vídeo grande demais para o storage (máx. ${formatFileSize(MAX_BANNER_VIDEO_BYTES)}). Comprima o MP4 ou cole o link do vídeo no campo abaixo.`;
  }
  return message;
}

function guessUploadMime(file) {
  const name = String(file.name || "").toLowerCase();
  if (file.type && file.type !== "application/octet-stream") return file.type;
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return file.type || "application/octet-stream";
}

async function uploadFile(file, { banner = false } = {}) {
  const contentType = guessUploadMime(file);
  if (banner && contentType.startsWith("video/") && file.size > MAX_BANNER_VIDEO_BYTES) {
    throw new Error(uploadSizeError(file));
  }
  const uploadUrlEndpoint = banner ? "/api/admin/upload-url?media=banner" : "/api/admin/upload-url";
  const signedResponse = await fetch(uploadUrlEndpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType,
      size: file.size
    })
  });
  const signedData = await signedResponse.json().catch(() => ({}));
  if (signedResponse.status === 401) {
    showLogin();
    throw new Error("Sessão expirada. Entre novamente e repita o envio.");
  }
  if (signedResponse.ok && signedData.uploadUrl) {
    const putResponse = await fetch(signedData.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });
    if (!putResponse.ok) {
      const raw = await putResponse.text().catch(() => "");
      throw new Error(parseStorageError(raw) || "Falha no envio do arquivo para o storage.");
    }
    return { url: signedData.url, mediaType: signedData.mediaType };
  }
  if (signedResponse.status !== 501) {
    throw new Error(signedData.error || "Falha ao preparar envio do arquivo.");
  }

  const body = new FormData();
  body.append("file", file);
  const response = await fetch(banner ? "/api/admin/upload?media=banner" : "/api/admin/upload", {
    method: "POST",
    credentials: "same-origin",
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Falha no envio do arquivo.");
  }
  return data;
}

function collectBanners() {
  return [...bannerList.querySelectorAll(".banner-card")].map((card) => {
    const type = card.querySelector('[data-field="type"]').value;
    return {
      id: card.querySelector('[data-field="id"]').value,
      title: card.querySelector('[data-field="title"]').value,
      type,
      image: card.querySelector('[data-field="image"]').value,
      video: type === "video" ? card.querySelector('[data-field="video"]').value : ""
    };
  });
}

async function persistBanners() {
  const bannerError = document.getElementById("banner-error");
  const bannerOk = document.getElementById("banner-ok");
  const saveBtn = document.getElementById("save-banners-btn");
  showError(bannerError, "");
  bannerOk.hidden = true;
  catalog.banners = collectBanners();
  catalog.promoPopup = collectPromoPopup();
  saveBtn.disabled = true;
  try {
    const data = await request("/api/admin/banners", {
      method: "PUT",
      body: JSON.stringify({ banners: catalog.banners, promoPopup: catalog.promoPopup })
    });
    catalog.banners = data.banners;
    catalog.promoPopup = data.promoPopup || catalog.promoPopup;
    renderBanners();
    renderPromoPopupSettings();
    bannerOk.hidden = false;
    bannerOk.textContent = "Banners e cupom salvos. Atualize a home (Ctrl+F5) para ver a troca.";
  } catch (error) {
    showError(bannerError, error.message);
  } finally {
    saveBtn.disabled = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  showError(loginError, "");
  const submitBtn = loginForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  const form = new FormData(loginForm);
  try {
    await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        user: String(form.get("user") || "").trim(),
        password: String(form.get("password") || "")
      })
    });
    showPanel();
    await loadCatalog();
  } catch (error) {
    showError(loginError, error.message);
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await request("/api/admin/logout", { method: "POST" });
  showLogin();
});

document.querySelectorAll(".admin-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".admin-tabs button").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    button.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== `tab-${button.dataset.tab}`;
    });
    if (button.dataset.tab === "stock") stockSearch.focus();
    if (button.dataset.tab === "products") productSearch.focus();
    if (button.dataset.tab === "fiado") renderFiado();
  });
});

document.getElementById("new-product-btn").addEventListener("click", () => openProduct(null));
document.getElementById("new-product-stock-btn").addEventListener("click", () => openProduct(null));
document.getElementById("cancel-product").addEventListener("click", () => productDialog.close());
productSearch.addEventListener("input", renderProducts);
stockSearch.addEventListener("input", renderStock);
bindFilterBar("product-filters", "products", renderProducts);
bindFilterBar("stock-filters", "stock", renderStock);

document.getElementById("sales-period-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-period]");
  if (!button) return;
  salesFilter.period = button.dataset.period;
  renderSales();
});

document.getElementById("sales-category-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sale-cat]");
  if (!button) return;
  salesFilter.category = button.dataset.saleCat;
  renderSales();
});

document.getElementById("new-client-btn").addEventListener("click", () => openClient(null));
document.getElementById("cancel-client").addEventListener("click", () => document.getElementById("client-dialog").close());
document.getElementById("cancel-payment").addEventListener("click", () => document.getElementById("payment-dialog").close());
document.getElementById("cancel-fiado-edit").addEventListener("click", () => document.getElementById("fiado-edit-dialog").close());

document.getElementById("add-fiado-payment-row").addEventListener("click", () => {
  const list = document.getElementById("fiado-payments-list");
  const hint = list.querySelector(".panel-hint");
  if (hint) hint.remove();
  list.insertAdjacentHTML("beforeend", renderFiadoPaymentRow({ note: "Abatimento" }));
  updateFiadoEditTotals(document.getElementById("fiado-edit-form"));
});

document.getElementById("fiado-payments-list").addEventListener("click", (event) => {
  if (!event.target.closest("[data-remove-payment-row]")) return;
  event.target.closest(".fiado-payment-row")?.remove();
  const list = document.getElementById("fiado-payments-list");
  if (!list.querySelector(".fiado-payment-row")) {
    list.innerHTML = "<p class='panel-hint'>Nenhum abatimento registrado.</p>";
  }
  updateFiadoEditTotals(document.getElementById("fiado-edit-form"));
});

document.getElementById("fiado-edit-form").addEventListener("input", (event) => {
  updateFiadoEditTotals(event.currentTarget);
});

document.getElementById("fiado-edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("fiado-edit-error");
  showError(errorEl, "");
  const form = event.target;
  try {
    await request(`/api/admin/fiado/${form.elements.id.value}`, {
      method: "PUT",
      body: JSON.stringify({
        quantity: Number(form.elements.quantity.value),
        unitPrice: Number(form.elements.unitPrice.value),
        installmentAmount: Number(form.elements.installmentAmount.value || 0),
        nextDueDate: form.elements.nextDueDate.value,
        notes: form.elements.notes.value,
        payments: collectFiadoPaymentEditor()
      })
    });
    document.getElementById("fiado-edit-dialog").close();
    await loadCatalog();
  } catch (error) {
    showError(errorEl, error.message);
  }
});
document.getElementById("client-search").addEventListener("input", (event) => {
  clientSearchQuery = event.target.value;
  renderClients();
});

document.getElementById("client-list").addEventListener("click", async (event) => {
  const editId = event.target.closest("[data-edit-client]")?.dataset.editClient;
  const deleteId = event.target.closest("[data-delete-client]")?.dataset.deleteClient;
  if (editId) {
    openClientById(editId);
  }
  if (deleteId && window.confirm("Excluir este cliente?")) {
    await request(`/api/admin/clients/${deleteId}`, { method: "DELETE" });
    await loadCatalog();
  }
});

document.getElementById("client-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const clientError = document.getElementById("client-error");
  showError(clientError, "");
  const payload = Object.fromEntries(new FormData(event.target).entries());
  const id = payload.id;
  try {
    await request(id ? `/api/admin/clients/${id}` : "/api/admin/clients", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    document.getElementById("client-dialog").close();
    await loadCatalog();
  } catch (error) {
    showError(clientError, error.message);
  }
});

document.getElementById("fiado-category").addEventListener("change", () => {
  fillFiadoProducts(document.querySelector("#fiado-form [name='productId']").value);
});

document.querySelector("#fiado-form [name='productId']").addEventListener("change", (event) => {
  const option = event.target.selectedOptions[0];
  lastFiadoProductId = option?.value || "";
  if (option) {
    document.querySelector("#fiado-form [name='unitPrice']").value = option.dataset.price || 0;
  }
});

document.getElementById("fiado-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fiadoError = document.getElementById("fiado-error");
  showError(fiadoError, "");
  const payload = Object.fromEntries(new FormData(event.target).entries());
  if (!payload.clientId) {
    showError(fiadoError, "Cadastre e selecione um cliente.");
    return;
  }
  if (!payload.productId) {
    showError(fiadoError, "Selecione um produto.");
    return;
  }
  try {
    await request("/api/admin/fiado", {
      method: "POST",
      body: JSON.stringify({
        clientId: payload.clientId,
        productId: payload.productId,
        quantity: Number(payload.quantity),
        unitPrice: Number(payload.unitPrice),
        downPayment: Number(payload.downPayment || 0),
        nextDueDate: payload.nextDueDate,
        installmentAmount: Number(payload.installmentAmount || 0),
        notes: payload.notes
      })
    });
    lastFiadoProductId = payload.productId;
    event.target.elements.downPayment.value = 0;
    event.target.elements.notes.value = "";
    await loadCatalog();
  } catch (error) {
    showError(fiadoError, error.message);
  }
});

document.getElementById("fiado-status-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-fiado-status]");
  if (!button) return;
  fiadoFilter.status = button.dataset.fiadoStatus;
  renderFiado();
});

document.getElementById("fiado-alerts").addEventListener("click", (event) => {
  const editId = event.target.closest("[data-edit-client]")?.dataset.editClient;
  if (editId) {
    openClientById(editId);
  }
});

document.getElementById("fiado-list").addEventListener("click", async (event) => {
  const editPaymentBtn = event.target.closest("[data-edit-payment]");
  if (editPaymentBtn) {
    const entry = catalog.fiado.find((item) => item.id === editPaymentBtn.dataset.fiadoId);
    const payment = entry?.payments?.find((item) => item.id === editPaymentBtn.dataset.editPayment);
    if (entry && payment) openPaymentEdit(entry, payment);
    return;
  }

  const deletePaymentBtn = event.target.closest("[data-delete-payment]");
  if (deletePaymentBtn) {
    const entry = catalog.fiado.find((item) => item.id === deletePaymentBtn.dataset.fiadoId);
    if (!entry) return;
    if (!window.confirm("Excluir este abatimento? O saldo será recalculado.")) return;
    const payments = (entry.payments || []).filter((item) => item.id !== deletePaymentBtn.dataset.deletePayment);
    try {
      await persistFiadoPayments(entry, payments);
      await loadCatalog();
    } catch (error) {
      showError(document.getElementById("fiado-error"), error.message);
    }
    return;
  }

  const editFiadoId = event.target.closest("[data-edit-fiado]")?.dataset.editFiado;
  if (editFiadoId) {
    const entry = catalog.fiado.find((item) => item.id === editFiadoId);
    if (entry) openFiadoEdit(entry);
    return;
  }
  const editId = event.target.closest("[data-edit-client]")?.dataset.editClient;
  if (editId) {
    openClientById(editId);
    return;
  }
  const fiadoId = event.target.closest("[data-pay-fiado]")?.dataset.payFiado;
  if (!fiadoId) return;
  const entry = catalog.fiado.find((item) => item.id === fiadoId);
  if (entry) openPayment(entry);
});

document.getElementById("payment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const paymentError = document.getElementById("payment-error");
  showError(paymentError, "");
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    if (payload.paymentId) {
      const entry = catalog.fiado.find((item) => item.id === payload.fiadoId);
      if (!entry) throw new Error("Fiado não encontrado.");
      const payments = (entry.payments || []).map((pay) => (
        pay.id === payload.paymentId
          ? {
            ...pay,
            amount: Number(payload.amount),
            paidAt: payload.paidAt,
            note: payload.note
          }
          : pay
      ));
      await persistFiadoPayments(
        { ...entry, nextDueDate: payload.nextDueDate || entry.nextDueDate },
        payments
      );
    } else {
      await request(`/api/admin/fiado/${payload.fiadoId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(payload.amount),
          nextDueDate: payload.nextDueDate,
          note: payload.note
        })
      });
    }
    document.getElementById("payment-dialog").close();
    await loadCatalog();
  } catch (error) {
    showError(paymentError, error.message);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.target.matches("input, textarea, select")) return;
  event.preventDefault();
  if (!document.getElementById("tab-stock").hidden) stockSearch.focus();
  else if (!document.getElementById("tab-products").hidden) productSearch.focus();
});

function handleProductListClick(event) {
  const editBtn = event.target.closest("[data-edit]");
  const deleteBtn = event.target.closest("[data-delete]");
  const editId = editBtn?.dataset.edit;
  const deleteId = deleteBtn?.dataset.delete;
  if (editId) {
    openProduct(catalog.products.find((item) => item.id === editId));
  }
  if (deleteId && window.confirm("Excluir este produto da loja?")) {
    request(`/api/admin/products/${deleteId}`, { method: "DELETE" }).then(loadCatalog);
  }
}

productList.addEventListener("click", handleProductListClick);
document.getElementById("promo-product-list")?.addEventListener("click", handleProductListClick);

document.getElementById("product-files").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  try {
    for (const file of files) {
      productImages.push((await uploadFile(file)).url);
    }
    renderPhotoPreviews();
  } catch (error) {
    showError(productError, error.message);
  }
});

document.getElementById("product-previews").addEventListener("click", (event) => {
  const index = event.target.dataset.removePhoto;
  if (index === undefined) return;
  productImages.splice(Number(index), 1);
  renderPhotoPreviews();
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(productError, "");
  const payload = Object.fromEntries(new FormData(productForm).entries());
  payload.showOnHome = productForm.elements.showOnHome.checked;
  payload.stock = Number(payload.stock || 0);
  payload.images = productImages;
  payload.image = productImages[0] || "";
  if (!payload.image) {
    showError(productError, "Envie ao menos uma foto para a vitrine.");
    return;
  }
  const id = payload.id;
  try {
    await request(id ? `/api/admin/products/${id}` : "/api/admin/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    productDialog.close();
    await loadCatalog();
  } catch (error) {
    showError(productError, error.message);
  }
});

document.getElementById("stock-list").addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-stock]");
  if (!form) return;
  event.preventDefault();
  const quantity = Number(new FormData(form).get("quantity") || 0);
  stockFocusId = form.dataset.stock;
  await request("/api/admin/stock", {
    method: "POST",
    body: JSON.stringify({ productId: form.dataset.stock, quantity })
  });
  await loadCatalog();
});

document.getElementById("stock-list").addEventListener("click", (event) => {
  const editId = event.target.dataset.editStock;
  if (editId) {
    openProduct(catalog.products.find((item) => item.id === editId));
    return;
  }
  const step = event.target.closest("[data-step]");
  if (!step) return;
  const form = step.closest("form[data-stock]");
  const input = form?.querySelector("[name='quantity']");
  if (!input) return;
  input.value = Math.max(1, Number(input.value || 1) + Number(step.dataset.step));
});

document.getElementById("sale-category").addEventListener("change", () => {
  fillSaleProducts(document.querySelector("#sale-form [name='productId']").value);
});

document.querySelector("#sale-form [name='productId']").addEventListener("change", (event) => {
  const option = event.target.selectedOptions[0];
  lastSaleProductId = option?.value || "";
  if (option) {
    document.querySelector("#sale-form [name='unitPrice']").value = option.dataset.price || 0;
  }
});

async function registerSale() {
  const saleForm = document.getElementById("sale-form");
  const saleError = document.getElementById("sale-error");
  const submitBtn = document.getElementById("register-sale-btn");
  showError(saleError, "");
  const payload = Object.fromEntries(new FormData(saleForm).entries());
  if (!payload.productId) {
    showError(saleError, "Selecione um produto.");
    return;
  }
  const quantity = Number(payload.quantity);
  const unitPrice = Number(payload.unitPrice);
  if (!Number.isFinite(quantity) || quantity < 1) {
    showError(saleError, "Informe uma quantidade válida.");
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    showError(saleError, "Informe o valor unitário.");
    return;
  }
  submitBtn.disabled = true;
  try {
    await request("/api/admin/sales", {
      method: "POST",
      body: JSON.stringify({
        productId: payload.productId,
        quantity,
        unitPrice
      })
    });
    lastSaleProductId = payload.productId;
    saleForm.elements.quantity.value = 1;
    await loadCatalog();
    fillSaleProducts(payload.productId);
    const selected = document.querySelector("#sale-form [name='productId']").selectedOptions[0];
    if (selected) {
      document.querySelector("#sale-form [name='unitPrice']").value = selected.dataset.price || unitPrice;
    }
  } catch (error) {
    showError(saleError, error.message);
  } finally {
    submitBtn.disabled = false;
  }
}

document.getElementById("sale-form").addEventListener("submit", (event) => {
  event.preventDefault();
  registerSale();
});

document.getElementById("register-sale-btn").addEventListener("click", (event) => {
  event.preventDefault();
  registerSale();
});

document.getElementById("add-banner-btn").addEventListener("click", () => {
  catalog.banners.push({ title: "", type: "image", image: "", video: "" });
  renderBanners();
});

bannerList.addEventListener("change", async (event) => {
  const card = event.target.closest(".banner-card");
  if (!card) return;

  if (event.target.matches('[data-field="type"]')) {
    if (event.target.value === "image") {
      card.querySelector('[data-field="video"]').value = "";
    }
    catalog.banners = collectBanners();
    renderBanners();
    return;
  }

  if (event.target.matches('[data-field="media-url"]')) {
    const url = event.target.value.trim();
    const type = card.querySelector('[data-field="type"]').value;
    if (type === "video") {
      card.querySelector('[data-field="video"]').value = url;
      card.querySelector('[data-field="image"]').value = "";
    } else {
      card.querySelector('[data-field="image"]').value = url;
      card.querySelector('[data-field="video"]').value = "";
    }
    card.querySelector(".banner-preview").innerHTML = bannerMedia({
      type,
      video: type === "video" ? url : "",
      image: type === "image" ? url : ""
    });
    return;
  }

  if (!event.target.matches("[data-upload]")) return;
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const bannerError = document.getElementById("banner-error");
  showError(bannerError, "");
  try {
    const uploaded = await uploadFile(file, { banner: true });
    if (uploaded.mediaType === "video") {
      card.querySelector('[data-field="type"]').value = "video";
      card.querySelector('[data-field="video"]').value = uploaded.url;
      card.querySelector('[data-field="image"]').value = "";
    } else {
      card.querySelector('[data-field="type"]').value = "image";
      card.querySelector('[data-field="image"]').value = uploaded.url;
      card.querySelector('[data-field="video"]').value = "";
    }
    catalog.banners = collectBanners();
    await persistBanners();
  } catch (error) {
    showError(bannerError, error.message);
  }
});

bannerList.addEventListener("click", (event) => {
  const card = event.target.closest(".banner-card");
  if (!card) return;
  const moving = event.target.dataset.move;
  const removing = "remove" in event.target.dataset;
  if (!moving && !removing) return;
  const index = Number(card.dataset.index);
  catalog.banners = collectBanners();
  if (moving === "up" && index > 0) {
    [catalog.banners[index - 1], catalog.banners[index]] = [catalog.banners[index], catalog.banners[index - 1]];
  }
  if (moving === "down" && index < catalog.banners.length - 1) {
    [catalog.banners[index + 1], catalog.banners[index]] = [catalog.banners[index], catalog.banners[index + 1]];
  }
  if (removing) {
    catalog.banners.splice(index, 1);
  }
  renderBanners();
});

document.getElementById("save-banners-btn").addEventListener("click", () => {
  persistBanners();
});

document.getElementById("promo-image-url")?.addEventListener("input", (event) => {
  const value = event.target.value.trim();
  document.getElementById("promo-image").value = value;
  const preview = document.getElementById("promo-image-preview");
  if (preview) {
    preview.src = value;
    preview.hidden = !value;
  }
});

document.getElementById("promo-image-upload")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const bannerError = document.getElementById("banner-error");
  showError(bannerError, "");
  try {
    const uploaded = await uploadFile(file);
    document.getElementById("promo-image").value = uploaded.url;
    document.getElementById("promo-image-url").value = uploaded.url;
    const preview = document.getElementById("promo-image-preview");
    if (preview) {
      preview.src = uploaded.url;
      preview.hidden = false;
    }
  } catch (error) {
    showError(bannerError, error.message);
  }
});

document.getElementById("prospect-list")?.addEventListener("click", async (event) => {
  const deleteId = event.target.closest("[data-delete-prospect]")?.dataset.deleteProspect;
  if (!deleteId || !window.confirm("Excluir este prospect?")) return;
  await request(`/api/admin/prospects/${deleteId}`, { method: "DELETE" });
  await loadCatalog();
});

request("/api/admin/me")
  .then(async () => {
    showPanel();
    await loadCatalog();
  })
  .catch(showLogin);
