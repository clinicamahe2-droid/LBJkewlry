/* LB jewelry · painel da loja */

const CATEGORIES = [
  { slug: "correntes", label: "Correntes" },
  { slug: "pulseiras", label: "Pulseiras" },
  { slug: "brincos", label: "Brincos" },
  { slug: "aneis", label: "Anéis" }
];
const PHOTO_SLOTS = [["Peça", "1ª foto"], ["Mostruário", "2ª foto"], ["Em uso", "3ª foto"]];
const PAYMENT_METHODS = ["PIX", "Dinheiro", "Cartão"];
const MAX_BANNER_VIDEO_BYTES = 50 * 1024 * 1024;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

let catalog = { products: [], banners: [], sales: [], clients: [], fiado: [], prospects: [], promoPopup: {} };
const state = {
  screen: "home",
  pecas: { view: "available", filter: "all", q: "" },
  vendas: { period: "month", month: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })(), category: "all", limit: 40 },
  fiado: { view: "cobrar", q: "", clients: "open" },
  heroIndex: 0
};
let loaded = false;
let sheetBack = null;
let draft = null;

// ---------- utilidades ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (id, cls = "") => `<svg class="i ${cls}"><use href="#i-${id}"/></svg>`;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const brl = (v, cents) => {
  const n = num(v);
  const showCents = cents ?? Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: showCents ? 2 : 0, maximumFractionDigits: 2 });
};
const moneyTxt = (v) => `R$ ${brl(v)}`;
const money = (v) => `<span class="money"><span class="cur">R$</span>${brl(v)}</span>`;
const moneyK = (v) => {
  const n = num(v);
  if (Math.abs(n) >= 100000) return `<span class="money"><span class="cur">R$</span>${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil</span>`;
  return money(Math.round(n));
};

function parseMoney(value) {
  let s = String(value ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
const moneyInput = (v) => (num(v) ? brl(v) : "");

function localISO(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso, days) {
  const d = new Date(`${iso || localISO()}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISO(d);
}
function fmtDate(value) {
  if (!value) return "—";
  const s = String(value);
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtDateFull(value) {
  if (!value) return "—";
  const s = String(value);
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("pt-BR");
}
function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso) {
  const today = localISO();
  if (iso === today) return "Hoje";
  if (iso === addDays(today, -1)) return "Ontem";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" }).replace(".", "");
}
const phoneDigits = (p) => String(p || "").replace(/\D/g, "");
function fmtPhone(p) {
  const d = phoneDigits(p);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p || "";
}
function whatsAppLink(phone, message) {
  const d = phoneDigits(phone);
  if (d.length < 10) return "";
  const full = d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}
const initials = (name) => String(name || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------- servidor ----------
async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  } catch {
    throw new Error("Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Não foi possível concluir a ação.");
    error.status = response.status;
    if (response.status === 401 && !url.endsWith("/login") && !url.endsWith("/me")) {
      closeSheet();
      showLogin("Sua sessão expirou. Entre de novo para continuar.");
    }
    throw error;
  }
  return data;
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
const fileSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

// Envia direto para o Storage com URL assinada; sem Storage, usa o envio pelo servidor.
async function uploadFile(file, { banner = false } = {}) {
  const contentType = guessUploadMime(file);
  if (banner && contentType.startsWith("video/") && file.size > MAX_BANNER_VIDEO_BYTES) {
    throw new Error(`Vídeo com ${fileSize(file.size)}. O máximo é 50 MB: comprima o MP4 (720p) ou cole o link do arquivo.`);
  }
  const signed = await fetch(banner ? "/api/admin/upload-url?media=banner" : "/api/admin/upload-url", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType, size: file.size })
  });
  const signedData = await signed.json().catch(() => ({}));
  if (signed.status === 401) { showLogin("Sua sessão expirou. Entre de novo e repita o envio."); throw new Error("Sessão expirada."); }
  if (signed.ok && signedData.uploadUrl) {
    const put = await fetch(signedData.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
    if (!put.ok) {
      const raw = await put.text().catch(() => "");
      if (/maximum allowed size|payload too large|entity too large/i.test(raw)) throw new Error("Arquivo grande demais para o storage (máx. 50 MB).");
      throw new Error(raw || "Falha ao enviar o arquivo.");
    }
    return { url: signedData.url, mediaType: signedData.mediaType || (contentType.startsWith("video/") ? "video" : "image") };
  }
  if (signed.status !== 501) throw new Error(signedData.error || "Não foi possível preparar o envio do arquivo.");
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(banner ? "/api/admin/upload?media=banner" : "/api/admin/upload", { method: "POST", credentials: "same-origin", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Falha ao enviar o arquivo.");
  return data;
}

// ---------- regras da loja ----------
const productById = (id) => catalog.products.find((p) => p.id === id);
const photosOf = (p) => (p?.images?.length ? p.images : p?.image ? [p.image] : []);
// Capa = foto do cartão na vitrine; pode não ser a 1ª da galeria (ex.: foto de mostruário).
const coverOf = (p) => p?.image || photosOf(p)[0] || "";
const hasSalePrice = (p) => num(p.priceList) > num(p.priceMax);
const isPromo = (p) => p.badge === "sale" || hasSalePrice(p);
const isAvailable = (p) => num(p.stock) > 0;
const isOnStore = (p) => isAvailable(p) && p.active !== false;
const missingPhotos = (p) => PHOTO_SLOTS.slice(photosOf(p).length, 2).map(([n]) => n);
const needsPhoto = (p) => isOnStore(p) && photosOf(p).length < 2;
function priceLabel(p) {
  return num(p.priceMin) !== num(p.priceMax) ? `${moneyTxt(p.priceMin)}–${brl(p.priceMax)}` : moneyTxt(p.priceMin);
}
function thumbHtml(p, cls = "thumb") {
  const src = coverOf(p);
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy">` : `<span class="${cls} thumb--ph">${esc(initials(p?.name || "LB"))}</span>`;
}
function grams(name) {
  const m = String(name || "").match(/(\d+[.,]\d+|\d+)\s*(g|gr|gramas)\b/i) || String(name || "").match(/\s(\d+[.,]\d+)\s*$/);
  return m ? `${m[1].replace(".", ",")} g` : "";
}

const saleRevenue = (s) => (s.type === "fiado" ? num(s.paidAtSale) : num(s.total));
const saleCost = (s) => (s.type === "fiado_payment" ? 0 : num(s.unitCost) * num(s.quantity || 0));
const saleDay = (s) => localISO(s.createdAt);
function saleKind(s) {
  if (s.type === "fiado") return { label: "Fiado", cls: "gold" };
  if (s.type === "fiado_payment") return { label: "Abatimento", cls: "green" };
  return { label: s.paymentMethod || "À vista", cls: "" };
}
function clientOf(entry) {
  const c = catalog.clients.find((x) => x.id === entry.clientId);
  return { id: c?.id || entry.clientId || "", name: c?.name || entry.clientName || "Cliente", phone: c?.phone || entry.clientPhone || "" };
}
function isDueSoon(e) {
  if (!e.nextDueDate || e.status !== "open") return false;
  return e.nextDueDate <= addDays(localISO(), 7);
}
function daysLate(e) {
  if (!e.nextDueDate) return 0;
  return Math.round((new Date(`${localISO()}T12:00:00`) - new Date(`${e.nextDueDate}T12:00:00`)) / 86400000);
}
const openFiado = () => catalog.fiado.filter((e) => e.status !== "paid");
function fiadoTone(e) {
  if (e.status === "paid") return "paid";
  if (e.status === "overdue") return "overdue";
  return isDueSoon(e) ? "soon" : "open";
}
function collectMessage(e) {
  const c = clientOf(e);
  const first = c.name.split(" ")[0];
  const lines = [`Olá ${first}, tudo bem?`, `Passando para lembrar do saldo de ${moneyTxt(e.balance)} da ${e.productName} na LB jewelry.`];
  if (e.nextDueDate) lines.push(e.status === "overdue" ? `O vencimento foi em ${fmtDateFull(e.nextDueDate)}.` : `O próximo vencimento é ${fmtDateFull(e.nextDueDate)}.`);
  if (num(e.installmentAmount)) lines.push(`Parcela combinada: ${moneyTxt(e.installmentAmount)}.`);
  lines.push("Podemos combinar o pagamento?");
  return lines.join("\n");
}
function clientLedger(clientId) {
  const entries = catalog.fiado.filter((e) => e.clientId === clientId);
  const open = entries.filter((e) => e.status !== "paid");
  return {
    entries, open,
    balance: open.reduce((s, e) => s + num(e.balance), 0),
    nextDue: open.map((e) => e.nextDueDate).filter(Boolean).sort()[0] || "",
    overdue: open.some((e) => e.status === "overdue")
  };
}
function monthPayments(monthKey = localISO().slice(0, 7)) {
  const rows = [];
  catalog.fiado.forEach((entry) => (entry.payments || []).forEach((pay) => { if (localISO(pay.paidAt).slice(0, 7) === monthKey) rows.push({ entry, pay }); }));
  return rows.sort((a, b) => String(b.pay.paidAt).localeCompare(String(a.pay.paidAt)));
}

function productPayload(p, overrides = {}) {
  return {
    name: p.name, categorySlug: p.categorySlug, collection: p.collection || "", sku: p.sku || "",
    badge: p.badge || "", priceMin: num(p.priceMin), priceMax: num(p.priceMax), priceList: p.priceList ?? "",
    cost: num(p.cost), stock: num(p.stock), stockSeen: num(p.stock), showOnHome: p.showOnHome !== false, active: p.active !== false,
    image: coverOf(p), images: photosOf(p), thickness: p.thickness || [], details: p.details || [], description: p.description || "",
    ...overrides
  };
}

// ---------- telas ----------
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
function setTitle() {
  const s = $(`#s-${state.screen}`);
  if (state.screen === "home") {
    $("#top-title").textContent = greeting();
    $("#top-sub").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  } else {
    $("#top-title").textContent = s.dataset.title;
    $("#top-sub").textContent = s.dataset.sub;
  }
}
function go(screen, { scroll = true } = {}) {
  if (!$(`#s-${screen}`)) screen = "home";
  state.screen = screen;
  $$(".screen").forEach((s) => { s.hidden = !loaded || s.id !== `s-${screen}`; });
  $$(".tab[data-go], .nav[data-go]").forEach((b) => (b.dataset.go === screen ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  setTitle();
  try { history.replaceState(null, "", `#${screen}`); } catch {}
  if (scroll) window.scrollTo({ top: 0 });
  if (screen === "vitrine") renderHeroPreview();
}

function renderAll() {
  renderHome();
  renderPecas();
  renderVendas();
  renderFiado();
  renderVitrine();
  const overdue = catalog.fiado.filter((e) => e.status === "overdue").length;
  $$("[data-overdue-badge]").forEach((b) => { b.hidden = !overdue; b.textContent = overdue; });
  setTitle();
}

// ---- início ----
function monthRevenue(key) {
  const rows = catalog.sales.filter((s) => localISO(s.createdAt).slice(0, 7) === key);
  const revenue = rows.reduce((t, s) => t + saleRevenue(s), 0);
  const cost = rows.reduce((t, s) => t + saleCost(s), 0);
  return { rows, revenue, cost, count: rows.filter((s) => s.type !== "fiado_payment").length };
}
function renderHome() {
  const now = new Date();
  const key = localISO(now).slice(0, 7);
  const prevKey = localISO(new Date(now.getFullYear(), now.getMonth() - 1, 15)).slice(0, 7);
  const cur = monthRevenue(key);
  const prev = monthRevenue(prevKey);
  $("#h-label").textContent = `Recebido em ${MONTHS_LONG[now.getMonth()]}`;
  $("#h-month").innerHTML = money(cur.revenue);
  $("#h-result").textContent = moneyTxt(cur.revenue - cur.cost);
  $("#h-margin").textContent = cur.revenue ? `${Math.round((cur.revenue - cur.cost) / cur.revenue * 100)}%` : "—";
  $("#h-count").textContent = plural(cur.count, "venda", "vendas");
  if (prev.revenue > 0) {
    const pct = Math.round((cur.revenue / prev.revenue - 1) * 100);
    $("#h-delta").innerHTML = `<span class="delta${pct < 0 ? " down" : ""}">${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs. ${MONTHS[(now.getMonth() + 11) % 12]}</span>`;
  } else $("#h-delta").innerHTML = "";

  const open = openFiado();
  const receivable = open.reduce((t, e) => t + num(e.balance), 0);
  const overdue = open.filter((e) => e.status === "overdue").sort((a, b) => num(b.balance) - num(a.balance));
  const soon = open.filter(isDueSoon);
  const available = catalog.products.filter(isAvailable);
  const units = available.reduce((t, p) => t + num(p.stock), 0);
  $("#home-kpis").innerHTML = `
    <button class="kpi" type="button" data-go-fiado="aberto"><span class="label">A receber</span><span class="v">${moneyK(receivable)}</span></button>
    <button class="kpi${overdue.length ? " alert" : ""}" type="button" data-go-fiado="cobrar"><span class="label">Vencidos</span><span class="v money">${overdue.length}</span></button>
    <button class="kpi" type="button" data-go="pecas"><span class="label">Em estoque</span><span class="v money">${units}<small style="font:500 11px var(--ui);color:var(--muted);margin-left:3px">un.</small></span></button>`;

  const semFoto = catalog.products.filter(needsPhoto);
  const attn = [...overdue.slice(0, 4), ...soon.slice(0, 2)].map(rowFiado);
  if (semFoto.length) attn.push(`<button class="rowi rowi--plain" type="button" data-pecas-filter="fotos"><span class="avatar" data-s="soon">${icon("camera", "i-sm")}</span><span class="mid"><span class="name">${plural(semFoto.length, "peça na loja sem foto do mostruário", "peças na loja sem foto do mostruário")}</span><span class="meta">${semFoto.slice(0, 3).map((p) => esc(p.name)).join(", ")}${semFoto.length > 3 ? "…" : ""}</span></span>${icon("chev", "chev")}</button>`);
  if (overdue.length > 4) attn.push(`<button class="rowi rowi--plain" type="button" data-go-fiado="cobrar"><span class="avatar">+${overdue.length - 4}</span><span class="mid"><span class="name">Mais ${plural(overdue.length - 4, "vencido", "vencidos")}</span><span class="meta">Ver a fila de cobrança</span></span>${icon("chev", "chev")}</button>`);
  $("#home-attn").innerHTML = attn.length ? attn.join("") : `<p class="empty"><b>Tudo em dia</b>Nenhum fiado vencido e as peças da loja têm fotos.</p>`;

  const recent = catalog.sales.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 4);
  $("#home-sales").innerHTML = recent.length ? recent.map(rowSale).join("") : `<p class="empty">Nenhuma venda registrada ainda.</p>`;

  const offers = catalog.products.filter((p) => isPromo(p) && isAvailable(p)).length;
  const popup = catalog.promoPopup || {};
  const newLeads = catalog.prospects.filter(isNewLead).length;
  const cost = available.reduce((t, p) => t + num(p.cost) * num(p.stock), 0);
  const value = available.reduce((t, p) => t + num(p.priceMin) * num(p.stock), 0);
  $("#home-store").innerHTML = `
    <button class="rowi rowi--plain" type="button" data-go="vitrine"><span class="avatar">${icon("store", "i-sm")}</span><span class="mid"><span class="name">Vitrine da loja</span><span class="meta">${plural(catalog.banners.length, "slide", "slides")} no banner · ${plural(offers, "oferta", "ofertas")} · cupom ${popup.enabled !== false ? "ativo" : "desligado"}${newLeads ? ` · ${plural(newLeads, "contato novo", "contatos novos")}` : ""}</span></span>${icon("chev", "chev")}</button>
    <button class="rowi rowi--plain" type="button" data-go="pecas"><span class="avatar">${icon("gem", "i-sm")}</span><span class="mid"><span class="name">${plural(available.length, "peça disponível", "peças disponíveis")}</span><span class="meta">Custo ${moneyTxt(cost)} · venda ${moneyTxt(value)}</span></span>${icon("chev", "chev")}</button>`;
}

// ---- peças ----
function salesOfProduct(p) {
  return catalog.sales.filter((s) => s.productId === p.id && s.type !== "fiado_payment").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
const buyerOf = (s) => s.clientName || (s.clientId ? clientOf(s).name : "") || "";
function rowProduct(p) {
  if (!isAvailable(p)) {
    const last = salesOfProduct(p)[0];
    const meta = last ? `Vendida${buyerOf(last) ? ` para ${esc(buyerOf(last))}` : ""} · ${fmtDate(last.createdAt)}${last.type === "fiado" ? " · fiado" : ""}` : "Sem estoque";
    return `<button class="rowi" type="button" data-product="${esc(p.id)}">${thumbHtml(p)}<span class="mid"><span class="name">${esc(p.name)}</span><span class="meta">${meta}</span></span><span class="end">${money(last ? last.unitPrice || p.priceMin : p.priceMin)}<span class="pill">Vendida</span></span></button>`;
  }
  const tags = [];
  if (p.active === false) tags.push('<span class="warn">inativa</span>');
  if (needsPhoto(p)) tags.push('<span class="warn">sem mostruário</span>');
  if (hasSalePrice(p) && isAvailable(p)) tags.push(`<span class="sale-t">oferta −${Math.round((1 - num(p.priceMax) / num(p.priceList)) * 100)}%</span>`);
  const meta = [p.category, grams(p.name), p.sku].filter(Boolean).map(esc).join(" · ") + (tags.length ? ` · ${tags.join(" · ")}` : "");
  const stock = isAvailable(p) ? `<span class="pill${num(p.stock) === 1 ? "" : " green"}">${p.stock} un.</span>` : `<span class="pill">Vendida</span>`;
  return `<button class="rowi${p.active === false ? " is-muted" : ""}" type="button" data-product="${esc(p.id)}">${thumbHtml(p)}<span class="mid"><span class="name">${esc(p.name)}</span><span class="meta">${meta}</span></span><span class="end">${money(p.priceMin)}${stock}</span></button>`;
}
function pecasPool() {
  const view = state.pecas.view;
  return catalog.products.filter((p) => (view === "sold" ? !isAvailable(p) : isAvailable(p)));
}
function renderPecas() {
  const available = catalog.products.filter(isAvailable);
  const sold = catalog.products.filter((p) => !isAvailable(p));
  const st = state.pecas;
  $("#pecas-view").innerHTML = `<button type="button" data-pecas-view="available" aria-pressed="${st.view === "available"}">Disponíveis<small>${available.length}</small></button><button type="button" data-pecas-view="sold" aria-pressed="${st.view === "sold"}">Vendidas<small>${sold.length}</small></button>`;
  const pool = pecasPool();
  const filters = [["all", "Todas", pool.length], ...CATEGORIES.map((c) => [c.slug, c.label, pool.filter((p) => p.categorySlug === c.slug).length])];
  const extra = [["promo", "Promoção", pool.filter(isPromo).length], ["home", "Na home", pool.filter((p) => p.showOnHome !== false).length], ["inactive", "Inativas", pool.filter((p) => p.active === false).length]];
  const fotos = pool.filter((p) => photosOf(p).length < 2 && isAvailable(p) && p.active !== false).length;
  $("#pecas-chips").innerHTML = filters.filter(([id, , n]) => id === "all" || n).map(([id, label, n]) => `<button class="chip" type="button" data-pecas-filter="${id}" aria-pressed="${st.filter === id}">${label}<small>${n}</small></button>`).join("")
    + extra.filter(([, , n]) => n).map(([id, label, n]) => `<button class="chip" type="button" data-pecas-filter="${id}" aria-pressed="${st.filter === id}">${label}<small>${n}</small></button>`).join("")
    + (fotos ? `<button class="chip warn" type="button" data-pecas-filter="fotos" aria-pressed="${st.filter === "fotos"}">Falta foto<small>${fotos}</small></button>` : "");
  const q = st.q.trim().toLowerCase();
  const list = pool.filter((p) => {
    const f = st.filter;
    if (CATEGORIES.some((c) => c.slug === f) && p.categorySlug !== f) return false;
    if (f === "promo" && !isPromo(p)) return false;
    if (f === "home" && p.showOnHome === false) return false;
    if (f === "inactive" && p.active !== false) return false;
    if (f === "fotos" && !(photosOf(p).length < 2 && p.active !== false)) return false;
    return !q || `${p.name} ${p.category} ${p.collection || ""} ${p.sku || ""} ${p.id}`.toLowerCase().includes(q);
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const cost = list.reduce((t, p) => t + num(p.cost) * Math.max(num(p.stock), 0), 0);
  const value = list.reduce((t, p) => t + num(p.priceMin) * Math.max(num(p.stock), 0), 0);
  $("#pecas-sum").innerHTML = st.view === "available"
    ? `<span><b>${plural(list.length, "peça", "peças")}</b></span>·<span>custo <b>${moneyTxt(cost)}</b></span>·<span>venda <b>${moneyTxt(value)}</b></span>`
    : `<span><b>${plural(list.length, "peça vendida", "peças vendidas")}</b></span>`;
  $("#pecas-list").innerHTML = list.length ? list.map(rowProduct).join("") : `<p class="empty"><b>Nenhuma peça encontrada</b>Tente outro nome, gramas ou código, ou troque o filtro.</p>`;
}

// ---- vendas ----
const monthKeyOf = (date) => localISO(date).slice(0, 7);
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} de ${y}`;
}
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  return monthKeyOf(new Date(y, m - 1 + delta, 15));
}
// Do mês da primeira venda até o mês atual, mais recente primeiro.
function salesMonths() {
  const current = monthKeyOf(new Date());
  const keys = catalog.sales.map((s) => monthKeyOf(s.createdAt)).filter((k) => /^\d{4}-\d{2}$/.test(k));
  let k = keys.length ? keys.reduce((a, b) => (a < b ? a : b)) : current;
  const out = [];
  while (k <= current && out.length < 240) { out.push(k); k = shiftMonth(k, 1); }
  return out.reverse();
}
function salesInPeriod() {
  const { period, category } = state.vendas;
  const now = new Date();
  return catalog.sales.filter((s) => {
    const d = new Date(s.createdAt);
    if (Number.isNaN(d.getTime())) return false;
    if (period === "month" && localISO(d).slice(0, 7) !== state.vendas.month) return false;
    if (period === "quarter" && d < new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)) return false;
    if (period === "year" && d.getFullYear() !== now.getFullYear()) return false;
    if (category !== "all") {
      const p = productById(s.productId);
      if (p?.categorySlug !== category) return false;
    }
    return true;
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
function rowSale(s) {
  const p = productById(s.productId);
  const k = saleKind(s);
  const who = s.clientName || (s.clientId ? clientOf(s).name : "");
  const when = saleDay(s) === localISO() ? fmtTime(s.createdAt) : fmtDate(s.createdAt);
  return `<button class="rowi" type="button" data-sale="${esc(s.id)}">${thumbHtml(p || { name: s.productName })}<span class="mid"><span class="name">${esc(s.productName || "Recebimento")}</span><span class="meta">${[who, when].filter(Boolean).map(esc).join(" · ")}</span></span><span class="end">${money(saleRevenue(s))}<span class="pill ${k.cls}">${esc(k.label)}</span></span></button>`;
}
function niceMax(v) {
  if (v <= 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((m) => m >= v);
}
function renderChart() {
  const cat = state.vendas.category;
  const endKey = state.vendas.period === "month" ? state.vendas.month : monthKeyOf(new Date());
  const months = Array.from({ length: 6 }, (_, i) => {
    const key = shiftMonth(endKey, i - 5);
    return { key, label: MONTHS[Number(key.slice(5)) - 1], total: 0 };
  });
  catalog.sales.forEach((s) => {
    if (cat !== "all" && productById(s.productId)?.categorySlug !== cat) return;
    const m = months.find((x) => x.key === localISO(s.createdAt).slice(0, 7));
    if (m) m.total += saleRevenue(s) / 1000;
  });
  const W = 340, H = 160, L = 34, R = 14, T = 20, B = 26;
  const max = niceMax(Math.max(...months.map((m) => m.total), 1));
  const x = (i) => L + i * (W - L - R) / (months.length - 1);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const pts = months.map((m, i) => [x(i), y(m.total)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const ticks = [0, max / 2, max];
  const fmtK = (v) => (v >= 10 ? Math.round(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
  const last = months.length - 1;
  $("#chart").innerHTML = `<defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".28"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${fmtK(v)}</text>`).join("")}
    <path d="${line} L${x(last)} ${y(0)} L${x(0)} ${y(0)} Z" fill="url(#ga)"/>
    <path d="${line}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === last ? 4.5 : 2.5}" fill="${i === last ? "var(--gold)" : "var(--surface)"}" stroke="var(--gold)" stroke-width="1.6"/>`).join("")}
    <text class="ax-strong" x="${Math.min(pts[last][0], W - R - 2)}" y="${Math.max(pts[last][1] - 10, 10)}" text-anchor="end">${fmtK(months[last].total)}</text>
    ${months.map((m, i) => `<text class="${i === last ? "ax-strong" : "ax"}" x="${x(i)}" y="${H - 8}" text-anchor="middle">${m.label}</text>`).join("")}
    ${months.map((m, i) => `<rect class="chart-hit" data-chart-month="${m.key}" x="${x(i) - (W - L - R) / 10}" y="${T - 10}" width="${(W - L - R) / 5}" height="${H - T}" fill="transparent"><title>${monthLabel(m.key)}: R$ ${brl(m.total * 1000)}</title></rect>`).join("")}`;
}
function renderVendas() {
  const v = state.vendas;
  const periods = [["month", "Mês"], ["quarter", "Trimestre"], ["year", "Ano"], ["all", "Tudo"]];
  $("#vendas-period").innerHTML = periods.map(([id, l]) => `<button type="button" data-period="${id}" aria-pressed="${v.period === id}">${l}</button>`).join("");
  const monthBar = $("#vendas-month");
  monthBar.hidden = v.period !== "month";
  if (v.period === "month") {
    const list = salesMonths();
    if (!list.includes(v.month)) v.month = list[0];
    const idx = list.indexOf(v.month);
    monthBar.innerHTML = `<button class="icon-btn" type="button" data-month-step="-1" aria-label="Mês anterior" ${idx >= list.length - 1 ? "disabled" : ""}>${icon("back", "i-sm")}</button>
      <label class="month-select"><span class="vh">Escolher mês</span><select class="input" id="vendas-month-select">${list.map((k) => `<option value="${k}"${k === v.month ? " selected" : ""}>${monthLabel(k)}</option>`).join("")}</select></label>
      <button class="icon-btn" type="button" data-month-step="1" aria-label="Próximo mês" ${idx <= 0 ? "disabled" : ""}>${icon("chev", "i-sm")}</button>`;
    $("#vendas-month-select").addEventListener("change", (e) => { v.month = e.target.value; v.limit = 40; renderVendas(); });
  }
  $("#vendas-cats").innerHTML = [["all", "Todas"], ...CATEGORIES.map((c) => [c.slug, c.label])].map(([id, l]) => `<button class="chip" type="button" data-sale-cat="${id}" aria-pressed="${v.category === id}">${l}</button>`).join("");
  const rows = salesInPeriod();
  const total = rows.reduce((t, s) => t + saleRevenue(s), 0);
  const cost = rows.reduce((t, s) => t + saleCost(s), 0);
  const salesOnly = rows.filter((s) => s.type !== "fiado_payment");
  const units = salesOnly.reduce((t, s) => t + num(s.quantity), 0);
  const now = new Date();
  const label = { month: `Recebido em ${monthLabel(v.month)}`, quarter: "Recebido no trimestre", year: `Recebido em ${now.getFullYear()}`, all: "Recebido no total" }[v.period];
  $("#v-label").textContent = label;
  $("#v-total").innerHTML = money(total);
  $("#v-cost").textContent = moneyTxt(cost);
  $("#v-res").textContent = moneyTxt(total - cost);
  $("#v-ticket").textContent = salesOnly.length ? moneyTxt(Math.round(salesOnly.reduce((t, s) => t + num(s.total), 0) / salesOnly.length)) : "—";
  $("#v-units").textContent = plural(units, "peça vendida", "peças vendidas");
  renderChart();
  const byCat = {};
  rows.forEach((s) => { const c = productById(s.productId)?.category || "Outros"; byCat[c] = (byCat[c] || 0) + saleRevenue(s); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const top = cats[0]?.[1] || 1;
  $("#cat-bars").innerHTML = `<span class="label">Por categoria</span>` + (cats.length ? cats.map(([n, val], i) => `<div class="bar"><span>${esc(n)}</span><span class="track"><span class="fill${i === 1 ? " g" : ""}" style="width:${Math.max(2, val / top * 100)}%"></span></span><span class="val">${moneyTxt(val)}</span></div>`).join("") : `<p class="hint">Sem vendas neste período.</p>`);
  $("#hist-title").textContent = `Histórico · ${rows.length}`;
  const shown = rows.slice(0, v.limit);
  const days = [...new Set(shown.map(saleDay))];
  $("#sales-days").innerHTML = shown.length ? days.map((d) => {
    const list = shown.filter((s) => saleDay(s) === d);
    return `<div><div class="day-head"><h4>${esc(dayLabel(d))}</h4><span class="label">${moneyTxt(list.reduce((t, s) => t + saleRevenue(s), 0))}</span></div><div class="group">${list.map(rowSale).join("")}</div></div>`;
  }).join("") + (rows.length > shown.length ? `<button class="btn btn--ghost" type="button" data-more-sales>Mostrar mais ${Math.min(40, rows.length - shown.length)}</button>` : "")
    : `<div class="group"><p class="empty"><b>Nenhuma venda neste período</b>Troque o período ou registre uma venda.</p></div>`;
}

// ---- fiado ----
function rowFiado(e) {
  const c = clientOf(e);
  const tone = fiadoTone(e);
  const late = daysLate(e);
  const pill = tone === "overdue" ? `<span class="pill red">${late > 0 ? `${late} ${late === 1 ? "dia" : "dias"}` : "vencido"}</span>`
    : tone === "soon" ? `<span class="pill amber">${late === 0 ? "vence hoje" : `em ${-late} ${-late === 1 ? "dia" : "dias"}`}</span>`
    : tone === "paid" ? `<span class="pill green">Quitado</span>` : `<span class="pill">${e.nextDueDate ? fmtDate(e.nextDueDate) : "sem data"}</span>`;
  const meta = [e.productName, e.status !== "paid" && e.nextDueDate ? `${e.status === "overdue" ? "venceu" : "vence"} ${fmtDate(e.nextDueDate)}` : ""].filter(Boolean).map(esc).join(" · ");
  return `<button class="rowi rowi--plain" type="button" data-fiado="${esc(e.id)}"><span class="avatar" data-s="${tone}">${esc(initials(c.name))}</span><span class="mid"><span class="name">${esc(c.name)}</span><span class="meta">${meta}</span></span><span class="end">${money(e.status === "paid" ? e.total : e.balance)}${pill}</span></button>`;
}
function rowClient(c) {
  const l = clientLedger(c.id);
  const tone = l.overdue ? "overdue" : l.balance > 0 ? "open" : "paid";
  const meta = [fmtPhone(c.phone), l.nextDue ? `vence ${fmtDate(l.nextDue)}` : "", l.open.length ? plural(l.open.length, "fiado aberto", "fiados abertos") : l.entries.length ? "sem saldo" : "sem fiado"].filter(Boolean).map(esc).join(" · ");
  return `<button class="rowi rowi--plain" type="button" data-client="${esc(c.id)}"><span class="avatar" data-s="${tone}">${esc(initials(c.name))}</span><span class="mid"><span class="name">${esc(c.name)}</span><span class="meta">${meta}</span></span><span class="end">${l.balance > 0 ? money(l.balance) : '<span class="pill green">Em dia</span>'}</span></button>`;
}
function fiadoMatches(e) {
  const q = state.fiado.q.trim().toLowerCase();
  if (!q) return true;
  const c = clientOf(e);
  return `${c.name} ${c.phone} ${e.productName}`.toLowerCase().includes(q);
}
const groupBlock = (title, total, inner) => `<div><div class="day-head"><h4>${title}</h4>${total !== null ? `<span class="label">${moneyTxt(total)}</span>` : ""}</div><div class="group">${inner}</div></div>`;
function renderFiado() {
  const f = state.fiado;
  const open = openFiado();
  const receivable = open.reduce((t, e) => t + num(e.balance), 0);
  const overdue = open.filter((e) => e.status === "overdue");
  const received = monthPayments().reduce((t, r) => t + num(r.pay.amount), 0);
  $("#fiado-kpis").innerHTML = `
    <button class="kpi" type="button" data-fiado-view="aberto" aria-pressed="${f.view === "aberto"}"><span class="label">A receber</span><span class="v">${moneyK(receivable)}</span></button>
    <button class="kpi${overdue.length ? " alert" : ""}" type="button" data-fiado-view="cobrar" aria-pressed="${f.view === "cobrar"}"><span class="label">Vencidos</span><span class="v money">${overdue.length}</span></button>
    <button class="kpi" type="button" data-fiado-view="recebidos" aria-pressed="${f.view === "recebidos"}"><span class="label">Recebido no mês</span><span class="v">${moneyK(received)}</span></button>`;
  const views = [["cobrar", "Cobrar"], ["aberto", "Abertos"], ["recebidos", "Recebidos"], ["clientes", "Clientes"]];
  $("#fiado-view").innerHTML = views.map(([id, l]) => `<button type="button" data-fiado-view="${id}" aria-pressed="${f.view === id}">${l}</button>`).join("");
  $("#q-fiado").placeholder = f.view === "clientes" ? "Buscar cliente ou telefone" : "Buscar cliente ou peça";
  const chips = $("#client-chips");
  chips.hidden = f.view !== "clientes";
  const box = $("#fiado-list");

  if (f.view === "clientes") {
    const withBalance = catalog.clients.filter((c) => clientLedger(c.id).balance > 0).length;
    chips.innerHTML = [["open", `Com saldo`, withBalance], ["all", "Todos", catalog.clients.length], ["clear", "Sem saldo", catalog.clients.length - withBalance]].map(([id, l, n]) => `<button class="chip" type="button" data-client-filter="${id}" aria-pressed="${f.clients === id}">${l}<small>${n}</small></button>`).join("");
    const q = f.q.trim().toLowerCase();
    const list = catalog.clients.filter((c) => {
      const bal = clientLedger(c.id).balance;
      if (f.clients === "open" && bal <= 0) return false;
      if (f.clients === "clear" && bal > 0) return false;
      return !q || `${c.name} ${c.phone} ${c.address || ""} ${c.notes || ""}`.toLowerCase().includes(q);
    }).sort((a, b) => clientLedger(b.id).balance - clientLedger(a.id).balance || a.name.localeCompare(b.name, "pt-BR"));
    box.innerHTML = list.length ? `<div class="group">${list.map(rowClient).join("")}</div>` : `<div class="group"><p class="empty"><b>Nenhum cliente neste filtro</b>Use o botão Cliente para cadastrar.</p></div>`;
    return;
  }
  if (f.view === "recebidos") {
    const rows = monthPayments().filter((r) => fiadoMatches(r.entry));
    box.innerHTML = rows.length ? groupBlock(`Recebido em ${MONTHS_LONG[new Date().getMonth()]} · ${rows.length}`, rows.reduce((t, r) => t + num(r.pay.amount), 0), rows.map(({ entry, pay }) => {
      const c = clientOf(entry);
      return `<button class="rowi rowi--plain" type="button" data-fiado="${esc(entry.id)}"><span class="avatar" data-s="paid">${esc(initials(c.name))}</span><span class="mid"><span class="name">${esc(c.name)}</span><span class="meta">${esc(entry.productName)} · ${fmtDate(pay.paidAt)}${pay.note ? ` · ${esc(pay.note)}` : ""}</span></span><span class="end">${money(pay.amount)}</span></button>`;
    }).join("")) : `<div class="group"><p class="empty"><b>Nenhum abatimento neste mês</b>Os recebimentos aparecem aqui assim que forem registrados.</p></div>`;
    return;
  }
  if (f.view === "aberto") {
    const list = open.filter(fiadoMatches).sort((a, b) => num(b.balance) - num(a.balance));
    box.innerHTML = list.length ? groupBlock(`Em aberto · ${list.length}`, list.reduce((t, e) => t + num(e.balance), 0), list.map(rowFiado).join("")) : `<div class="group"><p class="empty"><b>Nenhum saldo em aberto</b>Todos os fiados estão quitados.</p></div>`;
    const paid = catalog.fiado.filter((e) => e.status === "paid" && fiadoMatches(e));
    if (paid.length) box.innerHTML += groupBlock(`Quitados · ${paid.length}`, null, paid.slice(0, 30).map(rowFiado).join(""));
    return;
  }
  const late = overdue.filter(fiadoMatches).sort((a, b) => daysLate(b) - daysLate(a));
  const soon = open.filter(isDueSoon).filter(fiadoMatches);
  const waiting = open.length - overdue.length - open.filter(isDueSoon).length;
  let html = "";
  if (late.length) html += groupBlock(`Vencidos · ${late.length}`, late.reduce((t, e) => t + num(e.balance), 0), late.map(rowFiado).join(""));
  if (soon.length) html += groupBlock(`Vence em 7 dias · ${soon.length}`, soon.reduce((t, e) => t + num(e.balance), 0), soon.map(rowFiado).join(""));
  if (!html) html = `<div class="group"><p class="empty"><b>Nada para cobrar agora</b>Nenhum vencido e nada vence nos próximos 7 dias.</p></div>`;
  if (waiting > 0 && !f.q) html += `<button class="btn btn--ghost" type="button" data-fiado-view="aberto">${plural(waiting, "outro fiado em aberto", "outros fiados em aberto")} · ver saldos</button>`;
  box.innerHTML = html;
}

// ---- vitrine ----
const isNewLead = (p) => p.createdAt && Date.now() - new Date(p.createdAt).getTime() < 7 * 86400000;
function slideMedia(b, cls) {
  if (b.type === "video" && b.video) return `<video class="${cls}" src="${esc(b.video)}"${b.image ? ` poster="${esc(b.image)}"` : ""} muted loop playsinline autoplay preload="metadata"></video>`;
  if (b.image) return `<img class="${cls}" src="${esc(b.image)}" alt="${esc(b.alt || b.title || "Banner")}" loading="lazy">`;
  return `<span class="${cls} vid-ph">${icon("image")}<small>Sem mídia</small></span>`;
}
function heroPreviewHtml(b, i, total) {
  return `<div class="hero-prev">${slideMedia(b, "hp-media")}${b.title ? `<span class="cap">${esc(b.title)}</span>` : ""}<span class="hp-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</span></div>`;
}
function renderHeroPreview() {
  const box = $("#hero-live");
  const list = catalog.banners;
  if (!box) return;
  if (!list.length) { box.innerHTML = `<div class="group"><p class="empty"><b>Sem banner</b>Sem slides, o banner some da loja.</p></div>`; return; }
  state.heroIndex %= list.length;
  box.innerHTML = heroPreviewHtml(list[state.heroIndex], state.heroIndex, list.length);
}
let heroTimer = null;
function startHeroRotation() {
  clearInterval(heroTimer);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  heroTimer = setInterval(() => {
    if (state.screen !== "vitrine" || document.hidden || catalog.banners.length < 2) return;
    state.heroIndex += 1;
    renderHeroPreview();
  }, 4500);
}
function bannerRow(b, k) {
  const n = catalog.banners.length;
  return `<div class="rowi banner-row"><button class="row-main" type="button" data-slide="${k}">${slideMedia(b, "bthumb")}<span class="mid"><span class="name">${b.title ? esc(b.title) : '<span style="color:var(--muted)">Sem texto por cima</span>'}</span><span class="meta">${b.type === "video" ? "Vídeo" : "Foto"} · ${k + 1}º slide</span></span></button><span class="order-btns"><button type="button" data-move-slide="${k}" data-dir="-1" aria-label="Subir slide" ${k === 0 ? "disabled" : ""}>${icon("up", "i-xs")}</button><button type="button" data-move-slide="${k}" data-dir="1" aria-label="Descer slide" ${k === n - 1 ? "disabled" : ""}>${icon("down", "i-xs")}</button></span></div>`;
}
function rowOffer(p) {
  const pct = hasSalePrice(p) ? Math.round((1 - num(p.priceMax) / num(p.priceList)) * 100) : 0;
  return `<button class="rowi" type="button" data-offer="${esc(p.id)}">${thumbHtml(p)}<span class="mid"><span class="name">${esc(p.name)}</span><span class="meta">${hasSalePrice(p) ? `de <s>${moneyTxt(p.priceList)}</s> por <b style="color:var(--ink)">${moneyTxt(p.priceMax)}</b>` : `${moneyTxt(p.priceMax)} · selo SALE`}</span></span><span class="end">${pct ? `<span class="pill red">−${pct}%</span>` : '<span class="pill red">SALE</span>'}</span></button>`;
}
function renderVitrine() {
  const offers = catalog.products.filter((p) => isPromo(p) && isAvailable(p));
  const popup = catalog.promoPopup || {};
  const enabled = popup.enabled !== false;
  const leads = catalog.prospects.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const newLeads = leads.filter(isNewLead).length;
  $("#vit-summary").innerHTML = `<span class="pill">${plural(catalog.banners.length, "slide", "slides")}</span><span class="pill ${offers.length ? "red" : ""}">${plural(offers.length, "oferta", "ofertas")}</span><span class="pill ${enabled ? "green" : ""}">Cupom ${enabled ? "ativo" : "desligado"}</span>`;
  renderHeroPreview();
  $("#vit-banners").innerHTML = catalog.banners.length ? catalog.banners.map(bannerRow).join("") : `<p class="empty"><b>Nenhum slide</b>Adicione uma foto ou vídeo para o topo da loja.</p>`;
  $("#vit-offers").innerHTML = offers.length ? offers.map(rowOffer).join("") : `<p class="empty"><b>Nenhuma peça em oferta</b>A seção Promoções fica escondida na loja.</p>`;
  $("#vit-popup").innerHTML = `<button class="popup-card" type="button" data-popup>${popup.image ? `<img src="${esc(popup.image)}" alt="">` : ""}<span class="mid"><b>${esc(popup.headline || "Pop-up do cupom")}</b><small>Cupom <b>${esc(popup.couponCode || "—")}</b>${popup.sellerPhone ? ` · WhatsApp ${esc(fmtPhone(popup.sellerPhone))}` : ""}</small></span>${icon("chev", "chev")}</button>
    <div class="switch-row"><span><b>Mostrar ao abrir a loja</b><small>O visitante deixa nome e WhatsApp para ver o cupom</small></span><button class="switch" type="button" role="switch" aria-checked="${enabled}" data-popup-toggle aria-label="Mostrar pop-up do cupom"></button></div>`;
  $("#vit-leads-count").textContent = newLeads ? plural(newLeads, "novo", "novos") : leads.length ? `${leads.length}` : "";
  $("#vit-leads").innerHTML = leads.length ? leads.map((c) => {
    const wa = whatsAppLink(c.phone, `Olá ${c.name.split(" ")[0]}, vi seu cadastro no cupom ${c.couponCode} da LB jewelry. Posso te ajudar a escolher uma peça?`);
    return `<div class="rowi rowi--plain"><span class="avatar">${esc(initials(c.name))}</span><span class="mid"><span class="name">${esc(c.name)}${isNewLead(c) ? ' <span class="pill gold">Novo</span>' : ""}</span><span class="meta">${esc(fmtPhone(c.phone))} · ${fmtDate(c.createdAt)} · ${esc(c.couponCode || "")}</span></span>${wa ? `<a class="wa-btn" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Chamar ${esc(c.name)} no WhatsApp">${icon("chat", "i-sm")}</a>` : ""}<button class="del-btn" type="button" data-del-lead="${esc(c.id)}" aria-label="Excluir contato ${esc(c.name)}">${icon("trash", "i-sm")}</button></div>`;
  }).join("") : `<p class="empty"><b>Nenhum contato ainda</b>Quem pedir o cupom na loja aparece aqui.</p>`;
}

// ---------- painéis ----------
function openSheet(title, body, foot = "", { back = null } = {}) {
  $("#sheet-title").textContent = title;
  $("#sheet-body").innerHTML = body;
  $("#sheet-foot").innerHTML = foot;
  $("#sheet-foot").hidden = !foot;
  sheetError("");
  sheetBack = back;
  $("#sheet-back").hidden = !back;
  $("#sheet-body").scrollTop = 0;
  $("#scrim").classList.add("on");
  const sheet = $("#sheet");
  sheet.classList.add("on");
  sheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  $("#scrim")?.classList.remove("on");
  const sheet = $("#sheet");
  if (!sheet) return;
  sheet.classList.remove("on");
  sheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  sheetBack = null;
  draft = null;
}
const sheetOpen = () => $("#sheet")?.classList.contains("on");
function sheetError(message) {
  const el = $("#sheet-error");
  el.hidden = !message;
  el.textContent = message || "";
}
let toastTimer;
function toast(message, { error = false } = {}) {
  const t = $("#toast");
  t.innerHTML = `${error ? "" : icon("check", "i-sm")}${esc(message)}`;
  t.classList.toggle("err", error);
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}
async function busy(btn, fn, label = "Salvando…") {
  const old = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = label; }
  sheetError("");
  try {
    return await fn();
  } catch (error) {
    if (error.status !== 401) { if (sheetOpen()) sheetError(error.message); else toast(error.message, { error: true }); }
    return undefined;
  } finally {
    if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; }
  }
}
const stepper = (id, value, min = 0, max = 999) => `<div class="stepper"><button type="button" data-step="${id}" data-d="-1" aria-label="Menos">−</button><input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${value}"><button type="button" data-step="${id}" data-d="1" aria-label="Mais">+</button></div>`;
const segHtml = (name, options, current) => `<div class="seg" role="group" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-seg-value="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`).join("")}</div>`;
const segValue = (name) => $(`[data-seg="${name}"] [aria-pressed="true"]`)?.dataset.segValue ?? "";

// ---- nova ação ----
function sheetNew() {
  openSheet("Nova ação", `<div class="menu">
    <button class="menu-item" type="button" data-open="sale"><span class="ic">${icon("bag")}</span><span><b>Registrar venda</b><small>À vista: PIX, dinheiro ou cartão</small></span></button>
    <button class="menu-item" type="button" data-open="fiado-sale"><span class="ic">${icon("hand")}</span><span><b>Venda no fiado</b><small>Com entrada e vencimento</small></span></button>
    <button class="menu-item" type="button" data-open="receive"><span class="ic">${icon("coin")}</span><span><b>Receber abatimento</b><small>Escolha o fiado e o valor</small></span></button>
    <button class="menu-item" type="button" data-new-product><span class="ic">${icon("camera")}</span><span><b>Nova peça</b><small>Começa pelas fotos da vitrine</small></span></button>
    <button class="menu-item" type="button" data-open="client"><span class="ic">${icon("user-plus")}</span><span><b>Novo cliente</b><small>Nome, telefone e endereço</small></span></button>
  </div>`);
}

// ---- peça ----
function sheetProduct(id) {
  const p = productById(id);
  if (!p) return closeSheet();
  const photos = photosOf(p);
  const missing = missingPhotos(p);
  const margin = num(p.priceMin) - num(p.cost);
  const sold = !isAvailable(p);
  const sales = salesOfProduct(p);
  const pills = [`<span class="pill">${esc(p.category || "")}</span>`];
  if (sold) pills.push('<span class="pill amber">Vendida · fora da loja</span>');
  else pills.push(p.showOnHome !== false ? '<span class="pill green">Na home</span>' : '<span class="pill">Fora da home</span>');
  if (p.active === false) pills.push('<span class="pill amber">Inativa</span>');
  if (isPromo(p) && !sold) pills.push('<span class="pill red">Oferta</span>');
  const saleRows = sales.map((s) => {
    const k = saleKind(s);
    const who = buyerOf(s);
    const target = s.type === "fiado" && s.fiadoId && catalog.fiado.some((e) => e.id === s.fiadoId) ? `data-fiado="${esc(s.fiadoId)}"` : `data-sale="${esc(s.id)}"`;
    return `<button class="rowi rowi--plain" type="button" ${target}><span class="avatar">${esc(initials(who || "?"))}</span><span class="mid"><span class="name">${who ? esc(who) : '<span style="color:var(--muted)">Cliente não informado</span>'}</span><span class="meta">${fmtDateFull(s.createdAt)}${num(s.quantity) > 1 ? ` · ${s.quantity} un.` : ""}</span></span><span class="end">${money(s.total)}<span class="pill ${k.cls}">${esc(k.label)}</span></span></button>`;
  }).join("");
  openSheet(p.name, `
    <div class="prod-head">${thumbHtml(p)}<div class="stack-sm">${hasSalePrice(p) ? `<span class="hint"><s>${moneyTxt(p.priceList)}</s></span>` : ""}${money(p.priceMin)}${num(p.priceMax) !== num(p.priceMin) ? `<span class="hint">até ${moneyTxt(p.priceMax)}</span>` : ""}<div class="pills">${pills.join("")}</div></div></div>
    <div class="facts"><div><span class="label">Estoque</span><b>${isAvailable(p) ? `${p.stock} un.` : "Vendida"}</b></div><div><span class="label">Custo</span><b>${num(p.cost) ? moneyTxt(p.cost) : "—"}</b></div><div><span class="label">Margem</span><b style="color:${margin >= 0 ? "var(--esmeralda)" : "var(--granada)"}">${num(p.cost) ? moneyTxt(margin) : "—"}</b></div></div>
    <button class="photo-row" type="button" data-edit-product="${esc(p.id)}"><span><b>Fotos na loja · ${photos.length} de 3</b>${missing.length ? `<small class="warn">Falta: ${missing.join(" e ")}</small>` : `<small>Peça, mostruário${photos.length > 2 ? " e em uso" : ""}</small>`}</span><span class="mini-photos">${[0, 1, 2].map((k) => (photos[k] ? `<img src="${esc(photos[k])}" alt="">` : '<span class="gap"></span>')).join("")}</span></button>
    ${sold ? `
    <div class="field"><span class="field-label">${sales.length > 1 ? `Vendas · ${sales.length}` : "Vendida para"}</span>${sales.length ? `<div class="group">${saleRows}</div>` : '<p class="hint">Nenhuma venda registrada para esta peça.</p>'}</div>
    <p class="hint">Saiu da loja sozinha quando o estoque zerou. Se repor o estoque, ela volta a aparecer.</p>
    <div class="actions actions--two">
      <button class="act" type="button" data-edit-product="${esc(p.id)}">${icon("edit")}Editar</button>
      <button class="act main" type="button" data-restock="${esc(p.id)}">${icon("box")}Repor estoque</button>
    </div>` : `
    <div class="actions">
      <button class="act main" type="button" data-sell="${esc(p.id)}">${icon("bag")}Vender</button>
      <button class="act" type="button" data-sell-fiado="${esc(p.id)}">${icon("hand")}Fiado</button>
      <button class="act" type="button" data-edit-product="${esc(p.id)}">${icon("edit")}Editar</button>
      <button class="act" type="button" data-restock="${esc(p.id)}">${icon("box")}Repor</button>
    </div>
    <div class="switch-row"><span><b>Mostrar na página principal</b><small>A peça aparece na home da loja</small></span><button class="switch" type="button" role="switch" aria-checked="${p.showOnHome !== false}" data-toggle-home="${esc(p.id)}" aria-label="Mostrar na página principal"></button></div>
    ${sales.length ? `<p class="hint">Já vendida ${plural(sales.length, "vez", "vezes")}: última para ${esc(buyerOf(sales[0]) || "cliente não informado")} em ${fmtDateFull(sales[0].createdAt)}.</p>` : ""}`}
    ${p.description ? `<p class="hint">${esc(p.description)}</p>` : ""}
    <button class="danger-link" type="button" data-delete-product="${esc(p.id)}">${icon("trash", "i-sm")}Excluir peça</button>`);
}
function sheetRestock(id) {
  const p = productById(id);
  openSheet("Repor estoque", `
    <div class="picker">${thumbHtml(p)}<span class="mid"><span class="name">${esc(p.name)}</span><span class="meta">Hoje: ${isAvailable(p) ? `${p.stock} un.` : "vendida"}</span></span></div>
    <div class="field"><span class="field-label">Unidades que chegaram</span>${stepper("rs-qty", 1, 1, 999)}</div>
    <p class="hint">Para corrigir o estoque para menos, use Editar peça.</p>`,
    `<button class="btn btn--ghost" type="button" data-product="${esc(p.id)}">Voltar</button><button class="btn btn--primary" type="button" data-save-restock="${esc(p.id)}">Repor</button>`, { back: () => sheetProduct(id) });
}

function sheetEditProduct(id) {
  const p = productById(id) || null;
  draft = {
    id: p?.id || "", photos: [...photosOf(p)], cover: coverOf(p), uploading: 0, categorySlug: p?.categorySlug || "pulseiras",
    badge: p?.badge || "", home: p ? p.showOnHome !== false : true, active: p ? p.active !== false : true, stockSeen: p ? num(p.stock) : null
  };
  const details = (p?.details || []).filter((d) => !/importado do vendafácil|venda importada/i.test(d)).join("\n");
  openSheet(p ? "Editar peça" : "Nova peça", `
    <div class="field">
      <div class="ph-head"><span class="field-label">Fotos na loja</span><span class="hint" id="ph-count"></span></div>
      <div class="slots" id="slots"></div>
      <label class="upload" for="ph-input"><span class="ic">${icon("camera")}</span><span><b>${p ? "Adicionar ou trocar fotos" : "Comece pelas fotos"}</b><small>Câmera ou galeria · JPG, PNG ou WEBP até 5 MB</small></span></label>
      <input class="vh" type="file" id="ph-input" accept="image/jpeg,image/png,image/webp" multiple>
      <p class="hint">A página da peça mostra as fotos nesta ordem (seta ‹ muda a posição). A estrela escolhe a capa do cartão na vitrine.</p>
    </div>
    <label class="field"><span class="field-label">Nome da peça</span><input class="input" id="ed-name" value="${esc(p?.name || "")}" placeholder="Ex.: Pulseira cartier 4,5 g" maxlength="120"></label>
    <div class="field"><span class="field-label">Categoria</span><div class="chips chips--wrap" data-pick="categorySlug">${CATEGORIES.map((c) => `<button class="chip" type="button" data-pick-value="${c.slug}" aria-pressed="${draft.categorySlug === c.slug}">${c.label}</button>`).join("")}</div></div>
    <div class="two"><label class="field"><span class="field-label">Preço</span><input class="input money-in" id="ed-price" inputmode="decimal" value="${moneyInput(p?.priceMin)}" placeholder="0"></label><label class="field"><span class="field-label">Custo</span><input class="input money-in" id="ed-cost" inputmode="decimal" value="${moneyInput(p?.cost)}" placeholder="0"></label></div>
    <p class="hint" id="ed-margin"></p>
    <div class="two"><div class="field"><span class="field-label">Estoque</span>${stepper("ed-stock", p ? num(p.stock) : 1, 0, 999)}</div><label class="field"><span class="field-label">Código</span><input class="input" id="ed-sku" value="${esc(p?.sku || "")}" placeholder="SKU"></label></div>
    <div class="field"><span class="field-label">Selo na foto</span>${segHtml("badge", [["", "Nenhum"], ["sale", "Sale"], ["new", "Lançamento"]], draft.badge)}</div>
    <div class="switch-row"><span><b>Na página principal</b><small>Destaque na home da loja</small></span><button class="switch" type="button" role="switch" aria-checked="${draft.home}" data-draft-switch="home" aria-label="Na página principal"></button></div>
    <div class="switch-row"><span><b>Peça ativa</b><small>Desligada, some da loja sem apagar</small></span><button class="switch" type="button" role="switch" aria-checked="${draft.active}" data-draft-switch="active" aria-label="Peça ativa"></button></div>
    <label class="field"><span class="field-label">Descrição</span><textarea class="input" id="ed-desc" placeholder="Material, medidas, fecho">${esc(p?.description || "")}</textarea></label>
    <details class="more"${p && (num(p.priceMax) !== num(p.priceMin) || hasSalePrice(p)) ? " open" : ""}><summary>Mais detalhes</summary><div class="more-body">
      <div class="two"><label class="field"><span class="field-label">Preço máximo</span><input class="input" id="ed-pmax" inputmode="decimal" value="${p && num(p.priceMax) !== num(p.priceMin) ? moneyInput(p.priceMax) : ""}" placeholder="Se variar"></label><label class="field"><span class="field-label">Preço riscado</span><input class="input" id="ed-plist" inputmode="decimal" value="${moneyInput(p?.priceList)}" placeholder="Preço de antes"></label></div>
      <label class="field"><span class="field-label">Coleção</span><input class="input" id="ed-collection" value="${esc(p?.collection || "")}" placeholder="Coleção ${esc(CATEGORIES.find((c) => c.slug === draft.categorySlug)?.label || "")}"></label>
      <label class="field"><span class="field-label">Variantes (separadas por vírgula)</span><input class="input" id="ed-variants" value="${esc((p?.thickness || []).filter((t) => t !== "Único").join(", "))}" placeholder="Ex.: 4 mm, 6 mm"></label>
      <label class="field"><span class="field-label">Detalhes (um por linha)</span><textarea class="input" id="ed-details" placeholder="Ouro 18k&#10;45 cm">${esc(details)}</textarea></label>
    </div></details>
    ${p ? `<button class="danger-link" type="button" data-delete-product="${esc(p.id)}">${icon("trash", "i-sm")}Excluir peça</button>` : ""}`,
    `<button class="btn btn--ghost" type="button" ${p ? `data-product="${esc(p.id)}"` : "data-close"}>Cancelar</button><button class="btn btn--primary" type="button" data-save-product>${p ? "Salvar alterações" : "Cadastrar peça"}</button>`,
    { back: p ? () => sheetProduct(p.id) : null });
  renderSlots();
  updateMargin();
  $("#ed-price").addEventListener("input", updateMargin);
  $("#ed-cost").addEventListener("input", updateMargin);
  $("#ph-input").addEventListener("change", onPhotoFiles);
}
function updateMargin() {
  const price = parseMoney($("#ed-price")?.value);
  const cost = parseMoney($("#ed-cost")?.value);
  const el = $("#ed-margin");
  if (!el) return;
  el.innerHTML = price > 0 && cost > 0 ? `Margem <b class="${price - cost < 0 ? "neg" : ""}">${moneyTxt(price - cost)}</b> · ${Math.round((price - cost) / price * 100)}%` : "";
}
function renderSlots() {
  if (!draft || !$("#slots")) return;
  const ph = draft.photos;
  if (!ph.includes(draft.cover)) draft.cover = ph[0] || "";
  const filled = ph.map((src, k) => {
    const [n] = PHOTO_SLOTS[k] || [`Foto ${k + 1}`];
    const isCover = src === draft.cover;
    return `<figure class="slot${isCover ? " cover" : ""}"><img src="${esc(src)}" alt="${n}"><figcaption><b>${n}</b><small>${isCover ? "Capa da vitrine" : k === 0 ? "1ª da página" : `${k + 1}ª foto`}</small></figcaption><span class="slot-acts">${k ? `<button type="button" data-ph-left="${k}" aria-label="Mover para a esquerda" title="Mover para a esquerda">${icon("back", "i-xs")}</button>` : ""}${isCover ? "" : `<button type="button" data-ph-cover="${k}" aria-label="Usar como capa da vitrine" title="Usar como capa da vitrine">${icon("star", "i-xs")}</button>`}<button type="button" data-ph-remove="${k}" aria-label="Remover foto" title="Remover">${icon("x", "i-xs")}</button></span></figure>`;
  });
  const busySlots = Array.from({ length: draft.uploading }, () => `<div class="slot busy">Enviando…</div>`);
  const empty = PHOTO_SLOTS.slice(ph.length + draft.uploading).map(([n, d]) => `<label class="slot empty" for="ph-input">${icon("camera")}<b>${n}</b><small>${d} · adicionar</small></label>`);
  $("#slots").innerHTML = filled.concat(busySlots, empty).join("");
  $("#ph-count").textContent = `${ph.length} ${ph.length === 1 ? "foto" : "fotos"}`;
}
async function onPhotoFiles(event) {
  const files = [...event.target.files];
  event.target.value = "";
  const valid = files.filter((f) => /image\/(jpeg|png|webp)/.test(guessUploadMime(f)));
  if (valid.length < files.length) sheetError("Algumas fotos foram ignoradas: envie JPG, PNG ou WEBP.");
  const d = draft;
  for (const file of valid) {
    if (file.size > 5 * 1024 * 1024) { sheetError(`A foto ${file.name} tem ${fileSize(file.size)}. O máximo é 5 MB.`); continue; }
    d.uploading += 1;
    renderSlots();
    try {
      const up = await uploadFile(file);
      d.photos.push(up.url);
    } catch (error) {
      sheetError(error.message);
    } finally {
      d.uploading -= 1;
      if (draft === d) renderSlots();
    }
  }
}
async function saveProduct(btn) {
  const d = draft;
  if (d.uploading) return sheetError("Espere as fotos terminarem de enviar.");
  if (!d.photos.length) return sheetError("Adicione ao menos a foto da peça: ela é a capa na loja.");
  const name = $("#ed-name").value.trim();
  if (!name) { $("#ed-name").focus(); return sheetError("Dê um nome à peça."); }
  const price = parseMoney($("#ed-price").value);
  if (!(price >= 0) || Number.isNaN(price)) return sheetError("Preço inválido. Use números, como 1.250 ou 1.250,50.");
  const cost = parseMoney($("#ed-cost").value);
  const pmax = parseMoney($("#ed-pmax").value);
  const plist = parseMoney($("#ed-plist").value);
  if ([cost, pmax, plist].some(Number.isNaN)) return sheetError("Confira os valores: use números, como 1.250 ou 1.250,50.");
  const existing = productById(d.id);
  const variants = $("#ed-variants").value.split(",").map((s) => s.trim()).filter(Boolean);
  const details = $("#ed-details").value.split("\n").map((s) => s.trim()).filter(Boolean);
  const payload = {
    name, categorySlug: d.categorySlug, collection: $("#ed-collection").value.trim(), sku: $("#ed-sku").value.trim(),
    badge: segValue("badge"), priceMin: price, priceMax: pmax > price ? pmax : price, priceList: plist > 0 ? plist : "",
    cost, stock: Math.max(0, Math.floor(num($("#ed-stock").value))), showOnHome: d.home, active: d.active,
    image: d.photos.includes(d.cover) ? d.cover : d.photos[0], images: d.photos, thickness: variants.length ? variants : ["Único"],
    details: details.length ? details : (existing?.details || []), description: $("#ed-desc").value.trim()
  };
  if (existing) payload.stockSeen = d.stockSeen;
  await busy(btn, async () => {
    const saved = await request(existing ? `/api/admin/products/${encodeURIComponent(existing.id)}` : "/api/admin/products", { method: existing ? "PUT" : "POST", body: JSON.stringify(payload) });
    await loadCatalog();
    toast(existing ? "Peça salva" : "Peça cadastrada");
    sheetProduct(saved.id || existing?.id);
  });
}

// ---- venda e fiado ----
function productPickerHtml(selectedId, prefix) {
  const p = productById(selectedId);
  if (p) return `<button class="picker" type="button" data-repick="${prefix}">${thumbHtml(p)}<span class="mid"><span class="name">${esc(p.name)}</span><span class="meta">${p.stock} un. em estoque${num(p.cost) ? ` · custo ${moneyTxt(p.cost)}` : ""}</span></span><span class="pill">Trocar</span></button>`;
  return `<div class="stack-sm"><label class="search">${icon("search")}<input id="${prefix}-q" type="search" placeholder="Buscar peça para vender" autocomplete="off" aria-label="Buscar peça"></label><div class="group" id="${prefix}-list"></div></div>`;
}
function fillProductPick(prefix) {
  const list = $(`#${prefix}-list`);
  if (!list) return;
  const q = ($(`#${prefix}-q`)?.value || "").trim().toLowerCase();
  const all = catalog.products.filter((p) => isAvailable(p) && (!q || `${p.name} ${p.sku || ""} ${p.category}`.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const items = all.slice(0, 8);
  const more = all.length - items.length;
  list.innerHTML = (items.length ? items.map((p) => `<button class="rowi" type="button" data-pick-product="${esc(p.id)}" data-prefix="${prefix}">${thumbHtml(p)}<span class="mid"><span class="name">${esc(p.name)}</span><span class="meta">${esc(p.category)} · ${p.stock} un.</span></span><span class="end">${money(p.priceMin)}</span></button>`).join("") : `<p class="empty">Nenhuma peça disponível com esse nome.</p>`) + (more > 0 ? `<p class="pick-more">Mais ${plural(more, "peça", "peças")}: digite o nome para filtrar</p>` : "");
}
function sheetSale(productId = "") {
  draft = { kind: "sale", productId };
  const p = productById(productId);
  openSheet("Registrar venda", `
    <div class="field"><span class="field-label">Peça</span><div id="sale-picker">${productPickerHtml(productId, "sp")}</div></div>
    <div class="two"><label class="field"><span class="field-label">Valor (cada)</span><input class="input money-in" id="sale-price" inputmode="decimal" value="${moneyInput(p?.priceMin)}" placeholder="0"></label><div class="field"><span class="field-label">Quantidade</span>${stepper("sale-qty", 1, 1, p ? num(p.stock) : 99)}</div></div>
    <p class="hint" id="sale-margin"></p>
    <div class="field"><span class="field-label">Pagamento</span>${segHtml("pay", [...PAYMENT_METHODS.map((m) => [m, m]), ["", "Outro"]], "PIX")}</div>`,
    `<button class="btn btn--ghost" type="button" data-close>Cancelar</button><button class="btn btn--gold" type="button" data-save-sale>Confirmar venda</button>`,
    { back: productId ? () => sheetProduct(productId) : null });
  bindSaleForm("sp");
}
function bindSaleForm(prefix) {
  $(`#${prefix}-q`)?.addEventListener("input", () => fillProductPick(prefix));
  fillProductPick(prefix);
  const update = () => {
    const p = productById(draft?.productId);
    const el = $("#sale-margin");
    if (!el) return;
    const price = parseMoney($("#sale-price").value);
    const qty = Math.max(1, num($("#sale-qty").value));
    if (!p || !(price > 0)) { el.innerHTML = ""; return; }
    const parts = [`Total <b style="color:var(--ink)">${moneyTxt(price * qty)}</b>`];
    if (num(p.cost)) parts.push(`margem <b class="${price - num(p.cost) < 0 ? "neg" : ""}">${moneyTxt((price - num(p.cost)) * qty)}</b> (${Math.round((price - num(p.cost)) / price * 100)}%)`);
    el.innerHTML = parts.join(" · ");
  };
  $("#sale-price")?.addEventListener("input", update);
  $("#sale-qty")?.addEventListener("input", update);
  draft.updateTotals = update;
  update();
}
function pickProduct(id, prefix) {
  const p = productById(id);
  draft.productId = id;
  $(prefix === "sp" ? "#sale-picker" : "#fs-picker").innerHTML = productPickerHtml(id, prefix);
  $("#sale-price").value = moneyInput(p.priceMin);
  const qty = $("#sale-qty");
  qty.max = p.stock;
  if (num(qty.value) > num(p.stock)) qty.value = p.stock;
  draft.updateTotals?.();
}
async function saveSale(btn) {
  const p = productById(draft.productId);
  if (!p) return sheetError("Escolha a peça vendida.");
  const unitPrice = parseMoney($("#sale-price").value);
  const quantity = Math.floor(num($("#sale-qty").value));
  if (!(unitPrice > 0)) return sheetError("Informe o valor da venda.");
  if (quantity < 1) return sheetError("Informe a quantidade.");
  if (quantity > num(p.stock)) return sheetError(`Estoque insuficiente: há ${p.stock} un.`);
  await busy(btn, async () => {
    await request("/api/admin/sales", { method: "POST", body: JSON.stringify({ productId: p.id, quantity, unitPrice, paymentMethod: segValue("pay") }) });
    await loadCatalog();
    closeSheet();
    toast(`Venda de ${moneyTxt(unitPrice * quantity)} registrada`);
  });
}

function clientPickerHtml(clientId) {
  const c = catalog.clients.find((x) => x.id === clientId);
  if (c) {
    const l = clientLedger(c.id);
    return `<button class="picker" type="button" data-repick-client><span class="avatar">${esc(initials(c.name))}</span><span class="mid"><span class="name">${esc(c.name)}</span><span class="meta">${esc(fmtPhone(c.phone))}${l.balance > 0 ? ` · deve ${moneyTxt(l.balance)}` : ""}</span></span><span class="pill">Trocar</span></button>`;
  }
  if (draft?.newClient) {
    return `<div class="stack-sm"><div class="two"><label class="field"><span class="field-label">Nome</span><input class="input" id="nc-name" placeholder="Nome do cliente"></label><label class="field"><span class="field-label">Telefone</span><input class="input" id="nc-phone" inputmode="tel" placeholder="(48) 99999-9999"></label></div><button class="danger-link" style="color:var(--gold)" type="button" data-repick-client>Escolher cliente cadastrado</button></div>`;
  }
  return `<div class="stack-sm"><label class="search">${icon("search")}<input id="cp-q" type="search" placeholder="Buscar cliente" autocomplete="off" aria-label="Buscar cliente"></label><div class="group" id="cp-list"></div></div>`;
}
function fillClientPick() {
  const list = $("#cp-list");
  if (!list) return;
  const q = ($("#cp-q")?.value || "").trim().toLowerCase();
  const all = catalog.clients.filter((c) => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const items = all.slice(0, 7);
  list.innerHTML = `<button class="rowi rowi--plain" type="button" data-new-client-inline><span class="avatar">${icon("user-plus", "i-sm")}</span><span class="mid"><span class="name">Cadastrar cliente novo</span><span class="meta">Nome e telefone</span></span></button>`
    + items.map((c) => `<button class="rowi rowi--plain" type="button" data-pick-client="${esc(c.id)}"><span class="avatar">${esc(initials(c.name))}</span><span class="mid"><span class="name">${esc(c.name)}</span><span class="meta">${esc(fmtPhone(c.phone))}</span></span></button>`).join("")
    + (all.length > items.length ? `<p class="pick-more">Mais ${plural(all.length - items.length, "cliente", "clientes")}: digite o nome para filtrar</p>` : "");
}
function renderClientPicker() {
  $("#fs-client").innerHTML = clientPickerHtml(draft.clientId);
  $("#cp-q")?.addEventListener("input", fillClientPick);
  fillClientPick();
}
function sheetFiadoSale(productId = "", clientId = "") {
  draft = { kind: "fiado", productId, clientId, newClient: false };
  const p = productById(productId);
  openSheet("Venda no fiado", `
    <div class="field"><span class="field-label">Cliente</span><div id="fs-client"></div></div>
    <div class="field"><span class="field-label">Peça</span><div id="fs-picker">${productPickerHtml(productId, "fp")}</div></div>
    <div class="two"><label class="field"><span class="field-label">Valor (cada)</span><input class="input money-in" id="sale-price" inputmode="decimal" value="${moneyInput(p?.priceMin)}" placeholder="0"></label><div class="field"><span class="field-label">Quantidade</span>${stepper("sale-qty", 1, 1, p ? num(p.stock) : 99)}</div></div>
    <p class="hint" id="sale-margin"></p>
    <div class="two"><label class="field"><span class="field-label">Entrada</span><input class="input money-in" id="fs-entry" inputmode="decimal" placeholder="0"></label><label class="field"><span class="field-label">1º vencimento</span><input class="input" id="fs-due" type="date" value="${addDays(localISO(), 30)}"></label></div>
    <div class="field"><span class="field-label">Entrada paga em</span>${segHtml("pay", [...PAYMENT_METHODS.map((m) => [m, m]), ["", "Outro"]], "PIX")}</div>
    <div class="two"><label class="field"><span class="field-label">Parcela (opcional)</span><input class="input" id="fs-inst" inputmode="decimal" placeholder="Ex.: 500"></label><label class="field"><span class="field-label">Observação</span><input class="input" id="fs-notes" placeholder="Ex.: paga todo dia 10"></label></div>`,
    `<button class="btn btn--ghost" type="button" data-close>Cancelar</button><button class="btn btn--gold" type="button" data-save-fiado-sale>Registrar fiado</button>`,
    { back: productId ? () => sheetProduct(productId) : null });
  renderClientPicker();
  bindSaleForm("fp");
}
async function saveFiadoSale(btn) {
  const p = productById(draft.productId);
  if (!p) return sheetError("Escolha a peça.");
  const unitPrice = parseMoney($("#sale-price").value);
  const quantity = Math.floor(num($("#sale-qty").value));
  const downPayment = parseMoney($("#fs-entry").value) || 0;
  const installmentAmount = parseMoney($("#fs-inst").value) || 0;
  const nextDueDate = $("#fs-due").value;
  if (!(unitPrice > 0)) return sheetError("Informe o valor da venda.");
  if (quantity < 1 || quantity > num(p.stock)) return sheetError(`Quantidade inválida: há ${p.stock} un.`);
  if (Number.isNaN(downPayment) || downPayment > unitPrice * quantity) return sheetError("A entrada não pode ser maior que o total.");
  if (downPayment < unitPrice * quantity && !nextDueDate) return sheetError("Informe a data do primeiro vencimento.");
  let clientId = draft.clientId;
  const newName = $("#nc-name")?.value.trim();
  const newPhone = $("#nc-phone")?.value.trim();
  if (!clientId && !draft.newClient) return sheetError("Escolha o cliente ou cadastre um novo.");
  if (!clientId && (!newName || phoneDigits(newPhone).length < 10)) return sheetError("Informe nome e telefone com DDD do cliente novo.");
  await busy(btn, async () => {
    if (!clientId) {
      const c = await request("/api/admin/clients", { method: "POST", body: JSON.stringify({ name: newName, phone: newPhone }) });
      clientId = c.id;
      draft.clientId = clientId;
      draft.newClient = false;
    }
    const res = await request("/api/admin/fiado", { method: "POST", body: JSON.stringify({ clientId, productId: p.id, quantity, unitPrice, downPayment, nextDueDate, installmentAmount, notes: $("#fs-notes").value.trim(), paymentMethod: segValue("pay") }) });
    await loadCatalog();
    toast("Fiado registrado");
    sheetFiado(res.fiado.id);
  });
}

function sheetFiado(id) {
  const e = catalog.fiado.find((x) => x.id === id);
  if (!e) return closeSheet();
  const c = clientOf(e);
  const open = e.status !== "paid";
  const wa = whatsAppLink(c.phone, collectMessage(e));
  const pays = (e.payments || []).slice().sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  const quick = [];
  if (num(e.installmentAmount) && num(e.installmentAmount) < num(e.balance)) quick.push([e.installmentAmount, `Parcela ${moneyTxt(e.installmentAmount)}`]);
  [100, 200, 500].filter((v) => v < num(e.balance)).forEach((v) => quick.push([v, moneyTxt(v)]));
  quick.push([e.balance, `Quitar ${moneyTxt(e.balance)}`]);
  const tone = fiadoTone(e);
  openSheet(c.name, `
    <div class="facts"><div><span class="label">Total</span><b>${moneyTxt(e.total)}</b></div><div><span class="label">Pago</span><b>${moneyTxt(e.paid)}</b></div><div><span class="label">Saldo</span><b style="color:${tone === "overdue" ? "var(--granada)" : tone === "paid" ? "var(--esmeralda)" : "var(--ink)"}">${moneyTxt(e.balance)}</b></div></div>
    <button class="picker" type="button" data-client="${esc(c.id)}"><span class="avatar" data-s="${tone}">${esc(initials(c.name))}</span><span class="mid"><span class="name">${esc(e.productName)}${num(e.quantity) > 1 ? ` · ${e.quantity} un.` : ""}</span><span class="meta">${[fmtPhone(c.phone), open ? (e.nextDueDate ? `${e.status === "overdue" ? "venceu" : "vence"} ${fmtDateFull(e.nextDueDate)}` : "sem vencimento") : "quitado", num(e.installmentAmount) ? `parcela ${moneyTxt(e.installmentAmount)}` : ""].filter(Boolean).map(esc).join(" · ")}</span></span>${icon("chev", "chev")}</button>
    ${e.notes ? `<p class="hint">${esc(e.notes)}</p>` : ""}
    ${open ? `
      <div class="field"><span class="field-label">Registrar abatimento</span>
        <input class="input money-in" id="ab-val" inputmode="decimal" placeholder="Valor recebido">
        <div class="quick">${quick.map(([v, l]) => `<button class="chip" type="button" data-amount="${v}">${esc(l)}</button>`).join("")}</div>
      </div>
      <div class="field"><span class="field-label">Recebido em</span>${segHtml("abpay", PAYMENT_METHODS.map((m) => [m, m]), "PIX")}</div>
      <label class="field"><span class="field-label">Próximo vencimento (se sobrar saldo)</span><input class="input" id="ab-due" type="date" value="${e.nextDueDate && e.nextDueDate >= localISO() ? e.nextDueDate : addDays(localISO(), 30)}"></label>
      <div class="field"><span class="field-label">Mensagem de cobrança</span><div class="wa-preview">${esc(collectMessage(e))}</div>${wa ? `<a class="btn btn--wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon("chat", "i-sm")}Cobrar no WhatsApp</a>` : `<p class="hint">Cadastre o telefone do cliente para cobrar pelo WhatsApp.</p>`}</div>` : ""}
    <div class="field"><span class="field-label">Abatimentos · ${pays.length}</span>${pays.length ? `<div class="history">${pays.map((pay) => `<div><span>${fmtDateFull(pay.paidAt)}${pay.note ? ` · ${esc(pay.note)}` : ""}</span><b>${moneyTxt(pay.amount)}</b></div>`).join("")}</div>` : `<p class="hint">Nenhum abatimento ainda.</p>`}</div>
    <p class="hint">Venda em ${fmtDateFull(e.createdAt)}${e.paymentMethod ? ` · entrada em ${esc(e.paymentMethod)}` : ""}${num(e.unitCost) ? ` · custo ${moneyTxt(num(e.unitCost) * num(e.quantity || 1))}` : ""}</p>`,
    open ? `<button class="btn btn--ghost" type="button" data-edit-fiado="${esc(e.id)}">Editar</button><button class="btn btn--gold" type="button" data-save-payment="${esc(e.id)}">Registrar abatimento</button>`
      : `<button class="btn btn--ghost" type="button" data-close>Fechar</button><button class="btn btn--primary" type="button" data-edit-fiado="${esc(e.id)}">Editar fiado</button>`);
}
async function savePayment(btn, id) {
  const e = catalog.fiado.find((x) => x.id === id);
  const amount = parseMoney($("#ab-val").value);
  if (!(amount > 0)) { $("#ab-val").focus(); return sheetError("Informe o valor recebido."); }
  if (amount > num(e.balance) + 0.009) return sheetError(`O valor passa do saldo de ${moneyTxt(e.balance)}.`);
  const nextDueDate = $("#ab-due").value;
  if (amount < num(e.balance) && !nextDueDate) return sheetError("Informe o próximo vencimento.");
  await busy(btn, async () => {
    const updated = await request(`/api/admin/fiado/${encodeURIComponent(id)}/payments`, { method: "POST", body: JSON.stringify({ amount, nextDueDate, note: segValue("abpay") || "Abatimento" }) });
    await loadCatalog();
    toast(updated.status === "paid" ? "Fiado quitado" : `Abatimento de ${moneyTxt(amount)} registrado`);
    sheetFiado(id);
  });
}
function payRowHtml(pay = {}) {
  const date = pay.paidAt ? localISO(pay.paidAt) : localISO();
  return `<div class="pay-row" data-pay-row data-id="${esc(pay.id || "")}"><label class="field"><span class="field-label">Data</span><input class="input" type="date" data-f="paidAt" value="${date}"></label><label class="field"><span class="field-label">Valor</span><input class="input" inputmode="decimal" data-f="amount" value="${moneyInput(pay.amount)}" placeholder="0"></label><label class="field pay-note"><span class="field-label">Observação</span><input class="input" data-f="note" value="${esc(pay.note || "")}" placeholder="Ex.: PIX"></label><button class="x" type="button" data-remove-pay aria-label="Remover abatimento">${icon("trash", "i-sm")}</button></div>`;
}
function sheetEditFiado(id) {
  const e = catalog.fiado.find((x) => x.id === id);
  const c = clientOf(e);
  draft = { kind: "edit-fiado", id, expected: (e.payments || []).map((p) => p.id) };
  openSheet("Editar fiado", `
    <p class="hint"><b style="color:var(--ink)">${esc(c.name)}</b> · ${esc(e.productName)}</p>
    <div class="two"><div class="field"><span class="field-label">Quantidade</span>${stepper("ef-qty", e.quantity || 1, 1, 99)}</div><label class="field"><span class="field-label">Valor (cada)</span><input class="input" id="ef-price" inputmode="decimal" value="${moneyInput(e.unitPrice)}"></label></div>
    <div class="two"><label class="field"><span class="field-label">Parcela</span><input class="input" id="ef-inst" inputmode="decimal" value="${moneyInput(e.installmentAmount)}" placeholder="Opcional"></label><label class="field"><span class="field-label">Próximo vencimento</span><input class="input" id="ef-due" type="date" value="${e.nextDueDate || ""}"></label></div>
    <label class="field"><span class="field-label">Observação</span><input class="input" id="ef-notes" value="${esc(e.notes || "")}" placeholder="Ex.: paga todo dia 10"></label>
    <div class="field"><div class="ph-head"><span class="field-label">Abatimentos</span><button class="danger-link" style="color:var(--gold);padding:0" type="button" data-add-pay>+ Adicionar</button></div><div class="stack-sm" id="ef-pays">${(e.payments || []).map(payRowHtml).join("") || '<p class="hint" data-no-pays>Nenhum abatimento registrado.</p>'}</div><p class="hint">Corrija valores, datas ou remova lançamentos errados.</p></div>
    <div class="totals" id="ef-totals"></div>`,
    `<button class="btn btn--ghost" type="button" data-fiado="${esc(id)}">Cancelar</button><button class="btn btn--primary" type="button" data-save-edit-fiado="${esc(id)}">Salvar alterações</button>`,
    { back: () => sheetFiado(id) });
  updateFiadoTotals();
}
function collectPays() {
  return $$("#ef-pays [data-pay-row]").map((row) => ({ id: row.dataset.id, paidAt: $('[data-f="paidAt"]', row).value, amount: parseMoney($('[data-f="amount"]', row).value), note: $('[data-f="note"]', row).value.trim() }));
}
function updateFiadoTotals() {
  const el = $("#ef-totals");
  if (!el) return;
  const total = Math.max(1, num($("#ef-qty").value)) * (parseMoney($("#ef-price").value) || 0);
  const paid = collectPays().reduce((t, p) => t + (num(p.amount) || 0), 0);
  el.innerHTML = `<span>Total <b>${moneyTxt(total)}</b></span><span>Pago <b>${moneyTxt(paid)}</b></span><span>Saldo <b style="color:${total - paid < 0 ? "var(--granada)" : "var(--ink)"}">${moneyTxt(Math.max(0, total - paid))}</b></span>`;
}
async function saveEditFiado(btn, id) {
  const pays = collectPays();
  if (pays.some((p) => !(p.amount > 0))) return sheetError("Cada abatimento precisa de um valor maior que zero.");
  const unitPrice = parseMoney($("#ef-price").value);
  if (!(unitPrice >= 0)) return sheetError("Valor inválido.");
  await busy(btn, async () => {
    await request(`/api/admin/fiado/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({
      quantity: Math.max(1, Math.floor(num($("#ef-qty").value))), unitPrice, installmentAmount: parseMoney($("#ef-inst").value) || 0,
      nextDueDate: $("#ef-due").value, notes: $("#ef-notes").value.trim(),
      payments: pays.map((p) => ({ ...(p.id ? { id: p.id } : {}), paidAt: p.paidAt, amount: p.amount, note: p.note })), expectedPaymentIds: draft.expected
    }) });
    await loadCatalog();
    toast("Fiado atualizado");
    sheetFiado(id);
  });
}

function sheetClient(id = "") {
  const c = catalog.clients.find((x) => x.id === id);
  const l = c ? clientLedger(c.id) : null;
  const wa = c ? whatsAppLink(c.phone, l.balance > 0 ? `Olá ${c.name.split(" ")[0]}, tudo bem?\nSeu saldo em aberto na LB jewelry é ${moneyTxt(l.balance)}.` : `Olá ${c.name.split(" ")[0]}, tudo bem?`) : "";
  openSheet(c ? c.name : "Novo cliente", `
    ${c ? `<div class="facts"><div><span class="label">Saldo</span><b style="color:${l.overdue ? "var(--granada)" : "var(--ink)"}">${moneyTxt(l.balance)}</b></div><div><span class="label">Fiados</span><b>${l.entries.length}</b></div><div><span class="label">Próximo</span><b>${l.nextDue ? fmtDate(l.nextDue) : "—"}</b></div></div>
    ${wa ? `<a class="btn btn--wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon("chat", "i-sm")}Chamar no WhatsApp</a>` : ""}` : ""}
    <label class="field"><span class="field-label">Nome</span><input class="input" id="cl-name" value="${esc(c?.name || "")}" placeholder="Nome completo"></label>
    <label class="field"><span class="field-label">Telefone</span><input class="input" id="cl-phone" inputmode="tel" value="${esc(c?.phone || "")}" placeholder="(48) 99999-9999"></label>
    <label class="field"><span class="field-label">Endereço</span><input class="input" id="cl-address" value="${esc(c?.address || "")}" placeholder="Rua, bairro, cidade"></label>
    <label class="field"><span class="field-label">Anotações</span><textarea class="input" id="cl-notes" placeholder="Preferências, combinados de pagamento">${esc(c?.notes || "")}</textarea></label>
    ${c && l.entries.length ? `<div class="field"><span class="field-label">Fiados</span><div class="group">${l.entries.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(rowFiado).join("")}</div></div>` : ""}
    ${c ? `<button class="act" style="justify-items:start;grid-auto-flow:column;justify-content:start;padding:12px 14px" type="button" data-new-fiado-client="${esc(c.id)}">${icon("hand")}Nova venda no fiado para ${esc(c.name.split(" ")[0])}</button>
    <button class="danger-link" type="button" data-delete-client="${esc(c.id)}">${icon("trash", "i-sm")}Excluir cliente</button>` : ""}`,
    `<button class="btn btn--ghost" type="button" data-close>Cancelar</button><button class="btn btn--primary" type="button" data-save-client="${esc(c?.id || "")}">${c ? "Salvar cliente" : "Cadastrar cliente"}</button>`);
}
async function saveClient(btn, id) {
  const name = $("#cl-name").value.trim();
  const phone = $("#cl-phone").value.trim();
  if (!name) return sheetError("Informe o nome do cliente.");
  if (phoneDigits(phone).length < 10) return sheetError("Informe o telefone com DDD.");
  const existing = catalog.clients.find((x) => x.id === id);
  await busy(btn, async () => {
    const saved = await request(existing ? `/api/admin/clients/${encodeURIComponent(id)}` : "/api/admin/clients", { method: existing ? "PUT" : "POST", body: JSON.stringify({ name, phone, address: $("#cl-address").value.trim(), notes: $("#cl-notes").value.trim(), createdAt: existing?.createdAt }) });
    await loadCatalog();
    toast(existing ? "Cliente salvo" : "Cliente cadastrado");
    sheetClient(saved.id);
  });
}

function sheetSaleDetail(id) {
  const s = catalog.sales.find((x) => x.id === id);
  if (!s) return closeSheet();
  const p = productById(s.productId);
  const k = saleKind(s);
  const rev = saleRevenue(s);
  const cost = saleCost(s);
  const rows = [["Data", `${fmtDateFull(s.createdAt)} ${fmtTime(s.createdAt)}`], ["Tipo", k.label]];
  const who = s.clientName || (s.clientId ? clientOf(s).name : "");
  if (who) rows.push(["Cliente", who]);
  if (s.type !== "fiado_payment") rows.push(["Quantidade", `${s.quantity} × ${moneyTxt(s.unitPrice)}`], ["Total da venda", moneyTxt(s.total)]);
  if (s.type === "fiado") rows.push(["Entrada", moneyTxt(s.paidAtSale)]);
  if (s.paymentMethod && s.type !== "cash") rows.push(["Pagamento", s.paymentMethod]);
  if (cost) rows.push(["Custo", moneyTxt(cost)], ["Margem", moneyTxt(num(s.total) - cost)]);
  if (s.notes) rows.push(["Observação", s.notes]);
  openSheet(s.productName || "Recebimento", `
    <div class="prod-head">${thumbHtml(p || { name: s.productName })}<div class="stack-sm">${money(rev)}<div class="pills"><span class="pill ${k.cls}">${esc(k.label)}</span></div></div></div>
    <div class="history">${rows.map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}</div>
    ${s.fiadoId && catalog.fiado.some((e) => e.id === s.fiadoId) ? `<button class="picker" type="button" data-fiado="${esc(s.fiadoId)}"><span class="avatar">${icon("ledger", "i-sm")}</span><span class="mid"><span class="name">Ver o fiado</span><span class="meta">Saldo, abatimentos e cobrança</span></span>${icon("chev", "chev")}</button>` : ""}
    ${p ? `<button class="picker" type="button" data-product="${esc(p.id)}">${thumbHtml(p)}<span class="mid"><span class="name">Ver a peça</span><span class="meta">${isAvailable(p) ? `${p.stock} un. em estoque` : "Vendida"}</span></span>${icon("chev", "chev")}</button>` : ""}`);
}

function sheetReceive() {
  const open = openFiado().sort((a, b) => (a.status === "overdue" ? -1 : 0) - (b.status === "overdue" ? -1 : 0) || num(b.balance) - num(a.balance));
  openSheet("Receber abatimento", `<label class="search">${icon("search")}<input id="rc-q" type="search" placeholder="Buscar cliente ou peça" autocomplete="off" aria-label="Buscar cliente ou peça"></label><div class="group" id="rc-list"></div>`);
  const fill = () => {
    const q = $("#rc-q").value.trim().toLowerCase();
    const list = open.filter((e) => { const c = clientOf(e); return !q || `${c.name} ${e.productName}`.toLowerCase().includes(q); });
    $("#rc-list").innerHTML = list.length ? list.map(rowFiado).join("") : `<p class="empty">Nenhum fiado em aberto encontrado.</p>`;
  };
  $("#rc-q").addEventListener("input", fill);
  fill();
}

// ---- vitrine ----
async function saveBanners(banners, promoPopup) {
  const body = { banners: banners.map((b) => ({ id: b.id, type: b.type, title: b.title || "", alt: b.alt || "", image: b.image || "", video: b.video || "" })) };
  if (promoPopup) body.promoPopup = promoPopup;
  const data = await request("/api/admin/banners", { method: "PUT", body: JSON.stringify(body) });
  catalog.banners = data.banners;
  if (data.promoPopup) catalog.promoPopup = data.promoPopup;
  renderAll();
}
function sheetSlide(k) {
  const isNew = k === null;
  const b = isNew ? { type: "image", image: "", video: "", title: "", alt: "" } : catalog.banners[k];
  draft = { kind: "slide", k, ...b, uploading: false };
  const n = catalog.banners.length;
  openSheet(isNew ? "Novo slide" : `Slide ${k + 1} de ${n}`, `
    <div class="field"><span class="field-label">Como aparece na loja</span><div id="slide-prev"></div></div>
    <label class="upload" for="sl-file"><span class="ic">${icon("camera")}</span><span><b id="sl-up-label">${isNew ? "Escolher foto ou vídeo" : "Trocar foto ou vídeo"}</b><small>Foto JPG, PNG ou WEBP · vídeo MP4 até 50 MB</small></span></label>
    <input class="vh" type="file" id="sl-file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm">
    <label class="field"><span class="field-label">Texto sobre o banner</span><input class="input" id="sl-title" value="${esc(b.title || "")}" placeholder="Ex.: Novidades da temporada" maxlength="60"><span class="hint">Opcional. Aparece em letras grandes sobre a foto.</span></label>
    <label class="field"><span class="field-label">Descrição da imagem</span><input class="input" id="sl-alt" value="${esc(b.alt && b.alt !== "Banner" && b.alt !== b.title ? b.alt : "")}" placeholder="Ex.: Pulseira gourmet no pulso"><span class="hint">Lida por leitores de tela e pelo Google.</span></label>
    <details class="more"><summary>Colar link do arquivo</summary><div class="more-body"><label class="field"><span class="field-label">Link da foto ou do vídeo</span><input class="input" id="sl-url" value="${esc(b.type === "video" ? b.video : b.image)}" placeholder="https://… ou assets/uploads/arquivo.mp4"></label><p class="hint">Use se o vídeo for grande demais para enviar. Termine em .mp4 para vídeo.</p></div></details>
    ${isNew ? "" : `<div class="switch-row"><span><b>Posição no banner</b><small>${k + 1}º de ${n} slides</small></span><span class="order-btns order-btns--row"><button type="button" data-move-slide="${k}" data-dir="-1" data-in-sheet aria-label="Subir" ${k === 0 ? "disabled" : ""}>${icon("up", "i-xs")}</button><button type="button" data-move-slide="${k}" data-dir="1" data-in-sheet aria-label="Descer" ${k === n - 1 ? "disabled" : ""}>${icon("down", "i-xs")}</button></span></div>
    <button class="danger-link" type="button" data-remove-slide="${k}">${icon("trash", "i-sm")}Remover slide</button>`}`,
    `<button class="btn btn--ghost" type="button" data-close>Cancelar</button><button class="btn btn--primary" type="button" data-save-slide>${isNew ? "Adicionar ao banner" : "Salvar slide"}</button>`);
  const paint = () => { $("#slide-prev").innerHTML = heroPreviewHtml(draft, isNew ? n : k, n + (isNew ? 1 : 0)); };
  paint();
  $("#sl-title").addEventListener("input", (e) => { draft.title = e.target.value; paint(); });
  $("#sl-alt").addEventListener("input", (e) => { draft.alt = e.target.value; });
  $("#sl-url").addEventListener("change", (e) => {
    const url = e.target.value.trim();
    if (!url) return;
    const video = /\.(mp4|webm|mov)(\?|$)/i.test(url);
    Object.assign(draft, video ? { type: "video", video: url, image: "" } : { type: "image", image: url, video: "" });
    paint();
  });
  $("#sl-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const d = draft;
    d.uploading = true;
    $("#sl-up-label").textContent = `Enviando ${fileSize(file.size)}…`;
    sheetError("");
    try {
      const up = await uploadFile(file, { banner: true });
      Object.assign(d, up.mediaType === "video" ? { type: "video", video: up.url, image: "" } : { type: "image", image: up.url, video: "" });
      if (draft === d) { paint(); $("#sl-url").value = up.url; }
    } catch (error) {
      sheetError(error.message);
    } finally {
      d.uploading = false;
      if ($("#sl-up-label")) $("#sl-up-label").textContent = "Trocar foto ou vídeo";
    }
  });
}
async function saveSlide(btn) {
  const d = draft;
  if (d.uploading) return sheetError("Espere o arquivo terminar de enviar.");
  if (d.type === "video" ? !d.video : !d.image) return sheetError("Escolha uma foto ou um vídeo para o slide.");
  const title = $("#sl-title").value.trim();
  const slide = { id: d.id, type: d.type, image: d.image, video: d.type === "video" ? d.video : "", title, alt: $("#sl-alt").value.trim() || title || "Banner" };
  const list = catalog.banners.map((b) => ({ ...b }));
  if (d.k === null) list.push(slide); else list[d.k] = slide;
  const isNew = d.k === null;
  await busy(btn, async () => {
    await saveBanners(list);
    state.heroIndex = isNew ? list.length - 1 : d.k;
    renderHeroPreview();
    closeSheet();
    toast(isNew ? "Slide adicionado · já aparece na loja" : "Slide salvo · já aparece na loja");
  });
}
async function moveSlide(k, dir, inSheet, btn) {
  const to = k + dir;
  const list = catalog.banners.map((b) => ({ ...b }));
  if (to < 0 || to >= list.length) return;
  [list[k], list[to]] = [list[to], list[k]];
  await busy(btn, async () => {
    await saveBanners(list);
    state.heroIndex = to;
    renderHeroPreview();
    toast(`Agora é o ${to + 1}º slide`);
    if (inSheet) sheetSlide(to);
  }, "…");
}

function offerCardHtml(p, list, price) {
  const pct = list > price && price > 0 ? Math.round((1 - price / list) * 100) : 0;
  return `<div class="pcard"><div class="pcard-img">${thumbHtml(p, "")}${pct ? '<span class="sale">SALE</span>' : ""}</div><div class="pcard-body"><small>${esc(p.category || "")}</small><b>${esc(p.name)}</b><span>${pct ? `<s>${moneyTxt(list)}</s> ` : ""}<strong>${moneyTxt(price || 0)}</strong></span></div></div>`;
}
function sheetOffer(id) {
  const p = productById(id);
  if (!p) {
    const pool = catalog.products.filter((x) => isOnStore(x) && !isPromo(x)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    openSheet("Colocar peça em oferta", `<p class="hint">Escolha a peça. Depois você define o preço de antes e o da oferta.</p><label class="search">${icon("search")}<input id="of-q" type="search" placeholder="Buscar peça" autocomplete="off" aria-label="Buscar peça"></label><div class="group" id="of-list"></div>`);
    const fill = () => {
      const q = $("#of-q").value.trim().toLowerCase();
      const items = pool.filter((x) => !q || x.name.toLowerCase().includes(q));
      $("#of-list").innerHTML = items.length ? items.map((x) => `<button class="rowi" type="button" data-offer="${esc(x.id)}">${thumbHtml(x)}<span class="mid"><span class="name">${esc(x.name)}</span><span class="meta">${esc(x.category)} · ${x.stock} un.</span></span><span class="end">${money(x.priceMin)}</span></button>`).join("") : `<p class="empty">Nenhuma peça disponível com esse nome.</p>`;
    };
    $("#of-q").addEventListener("input", fill);
    fill();
    return;
  }
  const inOffer = isPromo(p);
  draft = { kind: "offer", id: p.id, list: hasSalePrice(p) ? num(p.priceList) : Math.round(num(p.priceMin) * 1.2 / 10) * 10, price: num(p.priceMin), badge: p.badge === "sale" || !inOffer };
  openSheet(inOffer ? "Editar oferta" : "Nova oferta", `
    <div class="offer-top"><div id="offer-card"></div><div class="offer-pct"><span class="label">Desconto</span><b class="money" id="offer-pct"></b><span class="hint">Assim a peça aparece na seção Promoções da loja.</span></div></div>
    <div class="two"><label class="field"><span class="field-label">Preço de antes</span><input class="input money-in" id="of-list" inputmode="decimal" value="${moneyInput(draft.list)}"></label><label class="field"><span class="field-label">Preço da oferta</span><input class="input money-in" id="of-price" inputmode="decimal" value="${moneyInput(draft.price)}"></label></div>
    <p class="hint" id="of-margin"></p>
    <div class="switch-row"><span><b>Selo SALE na foto</b><small>Etiqueta vermelha sobre a peça</small></span><button class="switch" type="button" role="switch" aria-checked="${draft.badge}" data-draft-switch="badge" aria-label="Selo SALE na foto"></button></div>
    ${inOffer ? `<button class="danger-link" type="button" data-remove-offer="${esc(p.id)}">${icon("x", "i-sm")}Tirar da oferta (mantém ${moneyTxt(p.priceMin)})</button>` : ""}`,
    `<button class="btn btn--ghost" type="button" data-close>Cancelar</button><button class="btn btn--gold" type="button" data-save-offer>Salvar oferta</button>`);
  const paint = () => {
    $("#offer-card").innerHTML = offerCardHtml(p, draft.list, draft.price);
    const pct = draft.list > draft.price && draft.price > 0 ? Math.round((1 - draft.price / draft.list) * 100) : 0;
    $("#offer-pct").textContent = pct ? `−${pct}%` : "—";
    $("#of-margin").innerHTML = draft.price && num(p.cost) ? `Margem na oferta: <b class="${draft.price - num(p.cost) < 0 ? "neg" : ""}">${moneyTxt(draft.price - num(p.cost))}</b> (custo ${moneyTxt(p.cost)})` : "";
  };
  paint();
  $("#of-list").addEventListener("input", (e) => { draft.list = parseMoney(e.target.value) || 0; paint(); });
  $("#of-price").addEventListener("input", (e) => { draft.price = parseMoney(e.target.value) || 0; paint(); });
}
async function saveOffer(btn) {
  const p = productById(draft.id);
  if (!(draft.price > 0)) return sheetError("Informe o preço da oferta.");
  if (!(draft.list > draft.price)) return sheetError("O preço de antes precisa ser maior que o da oferta.");
  const { price, list, badge } = draft;
  await busy(btn, async () => {
    await request(`/api/admin/products/${encodeURIComponent(p.id)}`, { method: "PUT", body: JSON.stringify(productPayload(p, { priceMin: price, priceMax: price, priceList: list, badge: badge ? "sale" : (p.badge === "sale" ? "" : p.badge || "") })) });
    await loadCatalog();
    closeSheet();
    toast(`Oferta salva · −${Math.round((1 - price / list) * 100)}% na loja`);
  });
}
// Tirar da oferta mantém o preço atual: só some o preço riscado e o selo SALE.
async function removeOffer(btn, id) {
  const p = productById(id);
  const price = num(p.priceMin);
  await busy(btn, async () => {
    await request(`/api/admin/products/${encodeURIComponent(p.id)}`, { method: "PUT", body: JSON.stringify(productPayload(p, { priceList: "", badge: p.badge === "sale" ? "" : p.badge || "" })) });
    await loadCatalog();
    closeSheet();
    toast(`Fora da oferta · preço continua ${moneyTxt(price)}`);
  }, "…");
}

function popupPreviewHtml(d) {
  return `<div class="pop-prev">${d.image ? `<img src="${esc(d.image)}" alt="">` : ""}<div class="pop-body"><b>${esc(d.headline || "Título do pop-up")}</b><span class="pop-in">Seu nome</span><span class="pop-in">Seu WhatsApp</span><span class="pop-btn">Ver meu cupom</span></div></div>`;
}
function sheetPopup() {
  const pp = catalog.promoPopup || {};
  draft = { kind: "popup", enabled: pp.enabled !== false, image: pp.image || "", couponCode: pp.couponCode || "", sellerPhone: pp.sellerPhone || "", headline: pp.headline || "", instruction: pp.instruction || "" };
  openSheet("Pop-up do cupom", `
    <div class="field"><span class="field-label">Como aparece na loja</span><div id="pop-prev"></div></div>
    <label class="upload" for="pp-file"><span class="ic">${icon("camera")}</span><span><b id="pp-up-label">Trocar imagem do pop-up</b><small>JPG, PNG ou WEBP</small></span></label>
    <input class="vh" type="file" id="pp-file" accept="image/jpeg,image/png,image/webp">
    <label class="field"><span class="field-label">Título</span><input class="input" id="pp-head" value="${esc(draft.headline)}" placeholder="Ganhe seu cupom de desconto"></label>
    <div class="two"><label class="field"><span class="field-label">Código do cupom</span><input class="input" id="pp-code" value="${esc(draft.couponCode)}" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600" placeholder="OUTUBRO10"></label><label class="field"><span class="field-label">WhatsApp do vendedor</span><input class="input" id="pp-phone" inputmode="tel" value="${esc(fmtPhone(draft.sellerPhone))}" placeholder="(48) 99999-9999"></label></div>
    <label class="field"><span class="field-label">Mensagem depois de liberar o cupom</span><textarea class="input" id="pp-ins" placeholder="Ao chamar no WhatsApp do vendedor, mencione o cupom.">${esc(draft.instruction)}</textarea></label>
    <details class="more"><summary>Colar link da imagem</summary><div class="more-body"><label class="field"><span class="field-label">Link da imagem</span><input class="input" id="pp-url" value="${esc(draft.image)}" placeholder="/assets/promo-coupon.jpg"></label></div></details>`,
    `<button class="btn btn--ghost" type="button" data-close>Cancelar</button><button class="btn btn--primary" type="button" data-save-popup>Salvar pop-up</button>`);
  const paint = () => { $("#pop-prev").innerHTML = popupPreviewHtml(draft); };
  paint();
  $("#pp-head").addEventListener("input", (e) => { draft.headline = e.target.value; paint(); });
  $("#pp-url").addEventListener("change", (e) => { draft.image = e.target.value.trim(); paint(); });
  $("#pp-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const d = draft;
    $("#pp-up-label").textContent = "Enviando…";
    try {
      const up = await uploadFile(file);
      d.image = up.url;
      if (draft === d) { $("#pp-url").value = up.url; paint(); }
    } catch (error) {
      sheetError(error.message);
    } finally {
      if ($("#pp-up-label")) $("#pp-up-label").textContent = "Trocar imagem do pop-up";
    }
  });
}
async function savePopup(btn) {
  const d = draft;
  const couponCode = $("#pp-code").value.trim().toUpperCase().replace(/\s+/g, "");
  const sellerPhone = phoneDigits($("#pp-phone").value);
  if (!couponCode) return sheetError("Informe o código do cupom.");
  if (sellerPhone.length < 10) return sheetError("Informe o WhatsApp do vendedor com DDD.");
  const promoPopup = { enabled: d.enabled, image: $("#pp-url").value.trim() || d.image, couponCode, sellerPhone, headline: $("#pp-head").value.trim(), instruction: $("#pp-ins").value.trim() };
  await busy(btn, async () => {
    await saveBanners(catalog.banners, promoPopup);
    closeSheet();
    toast("Pop-up salvo · já vale na loja");
  });
}

// ---------- ações ----------
async function toggleHome(btn, id) {
  const p = productById(id);
  const next = p.showOnHome === false;
  btn.setAttribute("aria-checked", String(next));
  await busy(null, async () => {
    await request(`/api/admin/products/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(productPayload(p, { showOnHome: next })) });
    await loadCatalog();
    toast(next ? "Peça na página principal" : "Peça fora da página principal");
  });
  if (sheetOpen() && productById(id)) btn.setAttribute("aria-checked", String(productById(id).showOnHome !== false));
}
async function deleteProduct(btn, id) {
  const p = productById(id);
  if (!window.confirm(`Excluir "${p.name}" da loja? As vendas já registradas continuam no histórico.`)) return;
  await busy(btn, async () => {
    await request(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadCatalog();
    closeSheet();
    toast("Peça excluída");
  }, "Excluindo…");
}
async function restock(btn, id) {
  const quantity = Math.floor(num($("#rs-qty").value));
  if (quantity < 1) return sheetError("Informe quantas unidades chegaram.");
  await busy(btn, async () => {
    const p = await request("/api/admin/stock", { method: "POST", body: JSON.stringify({ productId: id, quantity }) });
    await loadCatalog();
    toast(`Estoque: ${p.stock} un.`);
    sheetProduct(id);
  });
}
async function deleteClient(btn, id) {
  const c = catalog.clients.find((x) => x.id === id);
  if (!window.confirm(`Excluir ${c.name}? O histórico de vendas continua salvo.`)) return;
  await busy(btn, async () => {
    await request(`/api/admin/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadCatalog();
    closeSheet();
    toast("Cliente excluído");
  }, "Excluindo…");
}
async function deleteLead(btn, id) {
  const c = catalog.prospects.find((x) => x.id === id);
  if (!window.confirm(`Excluir o contato de ${c?.name || "cliente"}?`)) return;
  await busy(btn, async () => {
    await request(`/api/admin/prospects/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadCatalog();
    toast("Contato excluído");
  }, "…");
}
async function togglePopup(btn) {
  const pp = { ...(catalog.promoPopup || {}) };
  pp.enabled = pp.enabled === false;
  btn.setAttribute("aria-checked", String(pp.enabled));
  await busy(null, async () => {
    await saveBanners(catalog.banners, pp);
    toast(pp.enabled ? "Pop-up ligado na loja" : "Pop-up desligado");
  });
}
async function removeSlide(btn, k) {
  if (catalog.banners.length === 1) return sheetError("O banner precisa de pelo menos um slide.");
  if (!window.confirm("Remover este slide do banner da loja?")) return;
  const list = catalog.banners.filter((_, i) => i !== k);
  await busy(btn, async () => {
    await saveBanners(list);
    state.heroIndex = 0;
    closeSheet();
    toast("Slide removido");
  }, "Removendo…");
}

document.addEventListener("click", (event) => {
  const hit = event.target.closest("[data-chart-month]");
  if (hit) { state.vendas.period = "month"; state.vendas.month = hit.dataset.chartMonth; state.vendas.limit = 40; renderVendas(); return; }
  const t = event.target.closest("button, [data-product], [data-fiado], [data-client]");
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.go) { closeSheet(); if (d.go === "vendas" && t.classList.contains("hero--link")) { state.vendas.period = "month"; state.vendas.month = monthKeyOf(new Date()); renderVendas(); } go(d.go); return; }
  if (d.goFiado) { closeSheet(); state.fiado.view = d.goFiado; renderFiado(); go("fiado"); return; }
  if (d.pecasFilter && !t.closest("#pecas-chips")) { closeSheet(); state.pecas.view = "available"; state.pecas.filter = d.pecasFilter; renderPecas(); go("pecas"); return; }
  if (t.hasAttribute("data-close")) { closeSheet(); return; }
  if (t.id === "sheet-back") { sheetBack?.(); return; }
  if (d.open === "new") return sheetNew();
  if (d.open === "sale") return sheetSale("");
  if (d.open === "fiado-sale") return sheetFiadoSale("");
  if (d.open === "receive") return sheetReceive();
  if (d.open === "client") return sheetClient("");
  if (t.hasAttribute("data-new-product")) return sheetEditProduct("");
  if (t.hasAttribute("data-search-shortcut")) { closeSheet(); go("pecas"); setTimeout(() => $("#q-pecas").focus(), 60); return; }

  // filtros das telas
  if (d.pecasView) { state.pecas.view = d.pecasView; state.pecas.filter = "all"; renderPecas(); return; }
  if (d.pecasFilter) { state.pecas.filter = state.pecas.filter === d.pecasFilter && d.pecasFilter !== "all" ? "all" : d.pecasFilter; renderPecas(); return; }
  if (d.period) { state.vendas.period = d.period; state.vendas.limit = 40; renderVendas(); return; }
  if (d.monthStep) { state.vendas.month = shiftMonth(state.vendas.month, Number(d.monthStep)); state.vendas.limit = 40; renderVendas(); return; }
  if (d.saleCat) { state.vendas.category = d.saleCat; state.vendas.limit = 40; renderVendas(); return; }
  if (t.hasAttribute("data-more-sales")) { state.vendas.limit += 40; renderVendas(); return; }
  if (d.fiadoView) { closeSheet(); state.fiado.view = d.fiadoView; renderFiado(); if (state.screen !== "fiado") go("fiado"); return; }
  if (d.clientFilter) { state.fiado.clients = d.clientFilter; renderFiado(); return; }

  // abrir itens
  if (d.product) return sheetProduct(d.product);
  if (d.fiado) return sheetFiado(d.fiado);
  if (d.client !== undefined && t.hasAttribute("data-client")) return d.client ? sheetClient(d.client) : null;
  if (d.sale) return sheetSaleDetail(d.sale);
  if (d.editProduct) return sheetEditProduct(d.editProduct);
  if (d.restock) return sheetRestock(d.restock);
  if (d.sell) return sheetSale(d.sell);
  if (d.sellFiado) return sheetFiadoSale(d.sellFiado);
  if (d.newFiadoClient) return sheetFiadoSale("", d.newFiadoClient);
  if (d.editFiado) return sheetEditFiado(d.editFiado);
  if (d.slide !== undefined && t.hasAttribute("data-slide")) return sheetSlide(Number(d.slide));
  if (t.hasAttribute("data-new-slide")) return sheetSlide(null);
  if (t.hasAttribute("data-offer")) return sheetOffer(d.offer);
  if (t.hasAttribute("data-popup")) return sheetPopup();

  // dentro dos painéis
  if (d.pickProduct) return pickProduct(d.pickProduct, d.prefix);
  if (d.repick) { draft.productId = ""; $(d.repick === "sp" ? "#sale-picker" : "#fs-picker").innerHTML = productPickerHtml("", d.repick); $(`#${d.repick}-q`).addEventListener("input", () => fillProductPick(d.repick)); fillProductPick(d.repick); $(`#${d.repick}-q`).focus(); draft.updateTotals?.(); return; }
  if (d.pickClient) { draft.clientId = d.pickClient; draft.newClient = false; renderClientPicker(); return; }
  if (t.hasAttribute("data-new-client-inline")) { draft.clientId = ""; draft.newClient = true; renderClientPicker(); $("#nc-name").focus(); return; }
  if (t.hasAttribute("data-repick-client")) { draft.clientId = ""; draft.newClient = false; renderClientPicker(); $("#cp-q")?.focus(); return; }
  if (d.step) { const input = $(`#${d.step}`); const v = Math.floor(num(input.value)) + Number(d.d); input.value = Math.min(num(input.max || 999), Math.max(num(input.min || 0), v)); input.dispatchEvent(new Event("input", { bubbles: true })); return; }
  if (d.segValue !== undefined && t.closest("[data-seg]")) { $$("button", t.closest("[data-seg]")).forEach((b) => b.setAttribute("aria-pressed", String(b === t))); return; }
  if (d.pickValue && t.closest("[data-pick]")) { const box = t.closest("[data-pick]"); draft[box.dataset.pick] = d.pickValue; $$("button", box).forEach((b) => b.setAttribute("aria-pressed", String(b === t))); return; }
  if (d.draftSwitch) { draft[d.draftSwitch] = !draft[d.draftSwitch]; t.setAttribute("aria-checked", String(draft[d.draftSwitch])); return; }
  if (d.phRemove !== undefined && t.hasAttribute("data-ph-remove")) { draft.photos.splice(Number(d.phRemove), 1); renderSlots(); return; }
  if (d.phCover) { draft.cover = draft.photos[Number(d.phCover)]; renderSlots(); toast("Capa da vitrine definida"); return; }
  if (d.phLeft) { const k = Number(d.phLeft); [draft.photos[k - 1], draft.photos[k]] = [draft.photos[k], draft.photos[k - 1]]; renderSlots(); return; }
  if (d.amount) { $("#ab-val").value = moneyInput(Number(d.amount)); return; }
  if (t.hasAttribute("data-add-pay")) { $("[data-no-pays]")?.remove(); $("#ef-pays").insertAdjacentHTML("beforeend", payRowHtml({ note: "Abatimento" })); $("#ef-pays [data-pay-row]:last-child [data-f=amount]").focus(); updateFiadoTotals(); return; }
  if (t.hasAttribute("data-remove-pay")) { t.closest("[data-pay-row]").remove(); updateFiadoTotals(); return; }

  // salvar
  if (t.hasAttribute("data-save-product")) return saveProduct(t);
  if (d.saveRestock) return restock(t, d.saveRestock);
  if (t.hasAttribute("data-save-sale")) return saveSale(t);
  if (t.hasAttribute("data-save-fiado-sale")) return saveFiadoSale(t);
  if (d.savePayment) return savePayment(t, d.savePayment);
  if (d.saveEditFiado) return saveEditFiado(t, d.saveEditFiado);
  if (d.saveClient !== undefined && t.hasAttribute("data-save-client")) return saveClient(t, d.saveClient);
  if (t.hasAttribute("data-save-slide")) return saveSlide(t);
  if (d.moveSlide !== undefined && t.hasAttribute("data-move-slide")) return moveSlide(Number(d.moveSlide), Number(d.dir), t.hasAttribute("data-in-sheet"), t);
  if (d.removeSlide !== undefined && t.hasAttribute("data-remove-slide")) return removeSlide(t, Number(d.removeSlide));
  if (t.hasAttribute("data-save-offer")) return saveOffer(t);
  if (d.removeOffer) return removeOffer(t, d.removeOffer);
  if (t.hasAttribute("data-save-popup")) return savePopup(t);
  if (t.hasAttribute("data-popup-toggle")) return togglePopup(t);
  if (d.toggleHome) return toggleHome(t, d.toggleHome);
  if (d.deleteProduct) return deleteProduct(t, d.deleteProduct);
  if (d.deleteClient) return deleteClient(t, d.deleteClient);
  if (d.delLead) return deleteLead(t, d.delLead);
});

$("#scrim").addEventListener("click", closeSheet);
$("#sheet-body").addEventListener("input", () => updateFiadoTotals());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheetOpen()) { closeSheet(); return; }
  if (event.key === "/" && !event.target.matches("input, textarea, select") && !sheetOpen() && loaded) {
    event.preventDefault();
    go("pecas");
    $("#q-pecas").focus();
  }
});
$("#q-pecas").addEventListener("input", (e) => { state.pecas.q = e.target.value; renderPecas(); });
$("#q-fiado").addEventListener("input", (e) => { state.fiado.q = e.target.value; renderFiado(); });

// ---------- sessão ----------
async function loadCatalog() {
  const data = await request("/api/admin/store");
  catalog = {
    products: Array.isArray(data.products) ? data.products : [],
    banners: Array.isArray(data.banners) ? data.banners : [],
    sales: Array.isArray(data.sales) ? data.sales : [],
    clients: Array.isArray(data.clients) ? data.clients : [],
    fiado: Array.isArray(data.fiado) ? data.fiado : [],
    prospects: Array.isArray(data.prospects) ? data.prospects : [],
    promoPopup: data.promoPopup || {}
  };
  loaded = true;
  $("#loading").hidden = true;
  renderAll();
  go(state.screen, { scroll: false });
}
function showLogin(message = "") {
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
  const err = $("#login-error");
  err.hidden = !message;
  err.textContent = message;
}
async function enterPanel() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#app-error").hidden = true;
  const hash = location.hash.slice(1);
  if (["home", "pecas", "vendas", "fiado", "vitrine"].includes(hash)) state.screen = hash;
  setTitle();
  try {
    await loadCatalog();
    startHeroRotation();
  } catch (error) {
    if (error.status === 401) { showLogin("Login aceito, mas a sessão não foi salva. Libere os cookies deste site e tente de novo."); return; }
    $("#loading").hidden = true;
    const el = $("#app-error");
    el.hidden = false;
    el.textContent = `Não foi possível carregar os dados do painel: ${error.message} Recarregue a página.`;
  }
}
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = event.submitter || $("#login-form button[type=submit]");
  const err = $("#login-error");
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = "Entrando…";
  try {
    await request("/api/admin/login", { method: "POST", body: JSON.stringify({ user: $("#login-user").value.trim(), password: $("#login-password").value }) });
  } catch (error) {
    err.hidden = false;
    err.textContent = error.message;
    return;
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
  $("#login-password").value = "";
  await enterPanel();
});
$("#logout-btn").addEventListener("click", async () => {
  await request("/api/admin/logout", { method: "POST" }).catch(() => {});
  loaded = false;
  showLogin();
});

// O app instalado fica aberto por horas: ao voltar para ele, busca os dados de novo.
let lastRefreshAt = Date.now();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !loaded || $("#app-view").hidden) return;
  if (Date.now() - lastRefreshAt < 15000 || sheetOpen()) return;
  lastRefreshAt = Date.now();
  loadCatalog().catch((error) => { if (error.status !== 401) toast(`Não foi possível atualizar: ${error.message}`, { error: true }); });
});

// ---------- tema ----------
function currentTheme() {
  // Sem escolha salva, o painel abre no tema claro.
  try { const t = localStorage.getItem("lb-admin-theme"); return t === "auto" || t === "dark" ? t : "light"; } catch { return "light"; }
}
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
  try { localStorage.setItem("lb-admin-theme", theme); } catch {}
  const dark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  $$('meta[name="theme-color"]').forEach((m) => { m.content = theme === "auto" ? (m.media.includes("dark") ? "#0F0D0A" : "#F7F5F0") : dark ? "#0F0D0A" : "#F7F5F0"; });
  $$("#theme-seg [data-theme-pick]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themePick === theme)));
}
applyTheme(currentTheme());
document.addEventListener("click", (event) => {
  const b = event.target.closest("[data-theme-pick]");
  if (!b) return;
  applyTheme(b.dataset.themePick);
  toast({ auto: "Tema automático: segue o celular", light: "Tema claro", dark: "Tema escuro" }[b.dataset.themePick]);
});

// ---------- app instalado ----------
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function setupPwa() {
  if ("serviceWorker" in navigator) {
    if (isIos()) {
      // No iPhone, o service worker do app instalado impede o cookie de sessão.
      navigator.serviceWorker.getRegistrations().then(async (regs) => {
        if (!regs.length) return;
        const controlled = Boolean(navigator.serviceWorker.controller);
        await Promise.all(regs.map((r) => r.unregister()));
        if (controlled) window.location.reload();
      }).catch(() => {});
    } else {
      navigator.serviceWorker.getRegistrations().then(async (regs) => {
        await Promise.all(regs.filter((r) => { try { return new URL(r.scope).pathname === "/"; } catch { return false; } }).map((r) => r.unregister()));
        await navigator.serviceWorker.register("/sw-admin.js", { scope: "/admin" });
      }).catch(() => {});
    }
  }
  const row = $("#install-row");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) return;
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; row.hidden = false; });
  window.addEventListener("appinstalled", () => { deferred = null; row.hidden = true; });
  if (isIos()) { row.hidden = false; $("#install-meta").textContent = "No Safari: Compartilhar → Adicionar à Tela de Início"; }
  row.addEventListener("click", async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; row.hidden = true; return; }
    toast("No Safari: toque em Compartilhar e em Adicionar à Tela de Início");
  });
}

setupPwa();
request("/api/admin/me").then(enterPanel, () => showLogin());
