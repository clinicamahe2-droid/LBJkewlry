const fs = require("fs");
const path = require("path");
const { useSupabase } = require("./supabase");
const { loadCatalogFromSupabase, saveCatalogToSupabase } = require("./supabase-db");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const SEED_PATH = process.env.SEED_PATH || path.join(__dirname, "data", "seed.json");
const ADMIN_PATH = path.join(DATA_DIR, "admin.json");

const CATEGORIES = new Set(["correntes", "brincos", "pulseiras", "aneis"]);
const BADGES = new Set(["sale", "new", ""]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function migrateCatalogData(catalog) {
  let changed = false;
  const next = { ...catalog };
  if (!Array.isArray(next.products)) {
    next.products = [];
    changed = true;
  }
  if (!Array.isArray(next.banners)) {
    next.banners = [];
    changed = true;
  }
  next.products = next.products.map((product) => {
    const item = { ...product };
    if (!Number.isFinite(item.stock)) {
      item.stock = 5;
      changed = true;
    }
    if (typeof item.showOnHome !== "boolean") {
      item.showOnHome = true;
      changed = true;
    }
    return item;
  });
  if (!Array.isArray(next.sales)) {
    next.sales = [];
    changed = true;
  }
  if (!Array.isArray(next.clients)) {
    next.clients = [];
    changed = true;
  }
  if (!Array.isArray(next.fiado)) {
    next.fiado = [];
    changed = true;
  }
  next.fiado = next.fiado.map((entry) => refreshFiadoStatus(entry));
  return { catalog: next, changed };
}

function migrateCatalog(catalog) {
  const { catalog: migrated, changed } = migrateCatalogData(catalog);
  if (changed) {
    writeJson(CATALOG_PATH, migrated);
  }
  return migrated;
}

function refreshFiadoStatus(entry) {
  const balance = Math.max(0, toNumber(entry.total) - toNumber(entry.paid));
  const next = { ...entry, balance };
  if (balance <= 0) {
    next.status = "paid";
    return next;
  }
  const due = entry.nextDueDate ? new Date(`${entry.nextDueDate}T12:00:00`) : null;
  if (due && !Number.isNaN(due.getTime()) && due < new Date(new Date().toDateString())) {
    next.status = "overdue";
  } else {
    next.status = "open";
  }
  return next;
}

async function loadCatalog() {
  if (useSupabase()) {
    let catalog = await loadCatalogFromSupabase();
    if (!catalog.products.length && fs.existsSync(SEED_PATH)) {
      const seeded = migrateCatalogData(readJson(SEED_PATH)).catalog;
      await saveCatalogToSupabase(seeded);
      return seeded;
    }
    const migrated = migrateCatalogData(catalog).catalog;
    migrated.banners = migrated.banners.map((banner) => (
      banner.type === "video" ? { ...banner, image: "" } : banner
    ));
    return migrated;
  }

  ensureDir(DATA_DIR);
  if (!fs.existsSync(CATALOG_PATH)) {
    fs.copyFileSync(SEED_PATH, CATALOG_PATH);
  }
  return migrateCatalog(readJson(CATALOG_PATH));
}

async function saveCatalog(catalog) {
  if (useSupabase()) {
    await saveCatalogToSupabase(catalog);
    return;
  }
  writeJson(CATALOG_PATH, catalog);
}

function loadAdmin() {
  if (!fs.existsSync(ADMIN_PATH)) return null;
  return readJson(ADMIN_PATH);
}

function saveAdmin(admin) {
  writeJson(ADMIN_PATH, admin);
}

function stripTags(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "").trim();
}

function slugify(value) {
  return stripTags(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeProduct(input, existingId) {
  const name = stripTags(input.name);
  if (!name) {
    throw new Error("Nome do produto é obrigatório.");
  }

  const categorySlug = stripTags(input.categorySlug);
  if (!CATEGORIES.has(categorySlug)) {
    throw new Error("Categoria inválida.");
  }

  const categoryMap = {
    correntes: "Correntes",
    brincos: "Brincos",
    pulseiras: "Pulseiras",
    aneis: "Anéis"
  };

  const badge = stripTags(input.badge);
  if (!BADGES.has(badge)) {
    throw new Error("Selo inválido.");
  }

  const image = stripTags(input.image);
  if (!image) {
    throw new Error("Imagem principal é obrigatória.");
  }

  const extraImages = Array.isArray(input.images)
    ? input.images.map(stripTags).filter(Boolean)
    : [];
  const images = [image, ...extraImages.filter((src) => src !== image)];

  const variants = Array.isArray(input.thickness)
    ? input.thickness.map(stripTags).filter(Boolean)
    : stripTags(input.variants)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  const details = Array.isArray(input.details)
    ? input.details.map(stripTags).filter(Boolean)
    : stripTags(input.detailsText)
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

  const priceMin = Math.max(0, toNumber(input.priceMin));
  const priceMax = Math.max(priceMin, toNumber(input.priceMax) || priceMin);
  const priceList = toNumber(input.priceList);
  const stock = Math.max(0, Math.floor(toNumber(input.stock)));
  const showOnHome =
    input.showOnHome === true ||
    input.showOnHome === "on" ||
    input.showOnHome === "true" ||
    input.showOnHome === "1";

  return {
    id: existingId || slugify(input.id || name),
    name,
    category: categoryMap[categorySlug],
    categorySlug,
    collection: stripTags(input.collection) || `Coleção ${categoryMap[categorySlug]}`,
    badge: badge || null,
    priceMin,
    priceMax,
    priceList: priceList > priceMax ? priceList : undefined,
    stock,
    showOnHome,
    image,
    images,
    thickness: variants.length ? variants : ["Único"],
    description: stripTags(input.description),
    details: details.length ? details : ["Material informado pelo administrador"]
  };
}

async function publicCatalog() {
  const catalog = await loadCatalog();
  return {
    products: catalog.products,
    banners: catalog.banners
  };
}

function normalizeClient(input, existingId) {
  const name = stripTags(input.name);
  if (!name) {
    throw new Error("Nome do cliente é obrigatório.");
  }
  const phone = stripTags(input.phone);
  if (!phone) {
    throw new Error("Telefone do cliente é obrigatório.");
  }
  return {
    id: existingId || stripTags(input.id) || `client-${Date.now().toString(36)}`,
    name,
    phone,
    notes: stripTags(input.notes),
    createdAt: existingId
      ? stripTags(input.createdAt) || new Date().toISOString()
      : new Date().toISOString()
  };
}

function findClient(catalog, clientId) {
  const client = catalog.clients.find((item) => item.id === clientId);
  if (!client) {
    throw new Error("Cliente não encontrado.");
  }
  return client;
}

async function saveClient(input, existingId) {
  const catalog = await loadCatalog();
  const client = normalizeClient(input, existingId);
  if (existingId) {
    const index = catalog.clients.findIndex((item) => item.id === existingId);
    if (index === -1) {
      throw new Error("Cliente não encontrado.");
    }
    catalog.clients[index] = client;
  } else {
    catalog.clients.push(client);
  }
  await saveCatalog(catalog);
  return client;
}

async function deleteClient(clientId) {
  const catalog = await loadCatalog();
  const hasOpen = catalog.fiado.some(
    (item) => item.clientId === clientId && item.status !== "paid"
  );
  if (hasOpen) {
    throw new Error("Cliente possui fiado em aberto. Quite ou encerre antes de excluir.");
  }
  const next = catalog.clients.filter((item) => item.id !== clientId);
  if (next.length === catalog.clients.length) {
    throw new Error("Cliente não encontrado.");
  }
  catalog.clients = next;
  await saveCatalog(catalog);
  return { ok: true };
}

async function recordSale(input) {
  const catalog = await loadCatalog();
  const productId = stripTags(input.productId);
  const product = catalog.products.find((item) => item.id === productId);
  if (!product) {
    throw new Error("Produto não encontrado.");
  }

  const quantity = Math.max(1, Math.floor(toNumber(input.quantity) || 1));
  if (product.stock < quantity) {
    throw new Error(`Estoque insuficiente. Disponível: ${product.stock}.`);
  }

  const unitPrice = Math.max(0, toNumber(input.unitPrice) || product.priceMin);
  product.stock -= quantity;

  const sale = {
    id: `sale-${Date.now().toString(36)}`,
    type: "cash",
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice,
    total: unitPrice * quantity,
    createdAt: new Date().toISOString()
  };
  catalog.sales.unshift(sale);
  await saveCatalog(catalog);
  return { sale, product };
}

async function recordFiadoSale(input) {
  const catalog = await loadCatalog();
  const client = findClient(catalog, stripTags(input.clientId));
  const productId = stripTags(input.productId);
  const product = catalog.products.find((item) => item.id === productId);
  if (!product) {
    throw new Error("Produto não encontrado.");
  }

  const quantity = Math.max(1, Math.floor(toNumber(input.quantity) || 1));
  if (product.stock < quantity) {
    throw new Error(`Estoque insuficiente. Disponível: ${product.stock}.`);
  }

  const unitPrice = Math.max(0, toNumber(input.unitPrice) || product.priceMin);
  const total = unitPrice * quantity;
  const downPayment = Math.max(0, toNumber(input.downPayment));
  if (downPayment > total) {
    throw new Error("A entrada não pode ser maior que o total.");
  }

  const balance = total - downPayment;
  const nextDueDate = stripTags(input.nextDueDate);
  if (balance > 0 && !nextDueDate) {
    throw new Error("Informe a data do próximo vencimento.");
  }

  product.stock -= quantity;
  const now = new Date().toISOString();
  const fiadoId = `fiado-${Date.now().toString(36)}`;
  const payments = downPayment > 0
    ? [{ id: `pay-${Date.now().toString(36)}`, amount: downPayment, paidAt: now, note: "Entrada" }]
    : [];

  const fiado = refreshFiadoStatus({
    id: fiadoId,
    clientId: client.id,
    clientName: client.name,
    clientPhone: client.phone,
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice,
    total,
    paid: downPayment,
    balance,
    nextDueDate: balance > 0 ? nextDueDate : "",
    installmentAmount: balance > 0 ? Math.max(0, toNumber(input.installmentAmount)) : 0,
    notes: stripTags(input.notes),
    payments,
    createdAt: now
  });

  const sale = {
    id: `sale-${Date.now().toString(36)}`,
    type: "fiado",
    fiadoId,
    clientId: client.id,
    clientName: client.name,
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice,
    total,
    paidAtSale: downPayment,
    createdAt: now
  };

  catalog.fiado.unshift(fiado);
  catalog.sales.unshift(sale);
  await saveCatalog(catalog);
  return { fiado, sale, product };
}

async function recordFiadoPayment(fiadoId, input) {
  const catalog = await loadCatalog();
  const index = catalog.fiado.findIndex((item) => item.id === fiadoId);
  if (index === -1) {
    throw new Error("Fiado não encontrado.");
  }

  const entry = catalog.fiado[index];
  if (entry.status === "paid" || entry.balance <= 0) {
    throw new Error("Este fiado já está quitado.");
  }

  const amount = Math.max(0, toNumber(input.amount));
  if (amount <= 0) {
    throw new Error("Informe o valor do abatimento.");
  }
  if (amount > entry.balance) {
    throw new Error(`Valor acima do saldo. Restam R$ ${entry.balance.toFixed(2).replace(".", ",")}.`);
  }

  const now = new Date().toISOString();
  const payments = [...(entry.payments || []), {
    id: `pay-${Date.now().toString(36)}`,
    amount,
    paidAt: now,
    note: stripTags(input.note) || "Abatimento"
  }];

  const paid = toNumber(entry.paid) + amount;
  const balance = Math.max(0, toNumber(entry.total) - paid);
  const nextDueDate = balance > 0
    ? (stripTags(input.nextDueDate) || entry.nextDueDate)
    : "";

  if (balance > 0 && !nextDueDate) {
    throw new Error("Informe a data do próximo vencimento.");
  }

  const updated = refreshFiadoStatus({
    ...entry,
    paid,
    balance,
    payments,
    nextDueDate
  });

  catalog.fiado[index] = updated;
  catalog.sales.unshift({
    id: `sale-${Date.now().toString(36)}`,
    type: "fiado_payment",
    fiadoId: entry.id,
    clientId: entry.clientId,
    clientName: entry.clientName,
    productId: entry.productId,
    productName: entry.productName,
    quantity: 0,
    unitPrice: amount,
    total: amount,
    createdAt: now
  });
  await saveCatalog(catalog);
  return updated;
}

async function adjustStock(productId, quantity) {
  const catalog = await loadCatalog();
  const product = catalog.products.find((item) => item.id === productId);
  if (!product) {
    throw new Error("Produto não encontrado.");
  }
  const amount = Math.floor(toNumber(quantity));
  if (amount === 0) {
    throw new Error("Informe a quantidade de entrada.");
  }
  const next = product.stock + amount;
  if (next < 0) {
    throw new Error("Estoque não pode ficar negativo.");
  }
  product.stock = next;
  await saveCatalog(catalog);
  return product;
}

function isVideoPath(value) {
  return /\.(mp4|webm|mov)$/i.test(String(value || "").split("?")[0]);
}

function normalizeBanner(input, index) {
  const image = stripTags(input.image);
  const video = stripTags(input.video);
  const type = input.type === "video" ? "video" : "image";
  const title = stripTags(input.title);
  const alt = stripTags(input.alt) || title || "Banner";
  const id = stripTags(input.id) || `banner-${index + 1}`;

  if (type === "video") {
    const src = video || (isVideoPath(image) ? image : "");
    if (!src) {
      throw new Error("Cada banner de vídeo precisa de um arquivo MP4 ou WEBM.");
    }
    return {
      id,
      type: "video",
      image: "",
      video: src,
      title,
      alt
    };
  }

  if (!image || isVideoPath(image)) {
    throw new Error("Cada banner de imagem precisa de uma foto.");
  }
  return {
    id,
    type: "image",
    image,
    video: "",
    title,
    alt
  };
}

module.exports = {
  CATEGORIES,
  loadCatalog,
  saveCatalog,
  loadAdmin,
  saveAdmin,
  normalizeProduct,
  normalizeBanner,
  normalizeClient,
  publicCatalog,
  recordSale,
  recordFiadoSale,
  recordFiadoPayment,
  saveClient,
  deleteClient,
  adjustStock,
  slugify,
  DATA_DIR
};
