const fs = require("fs");
const path = require("path");

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

function migrateCatalog(catalog) {
  let changed = false;
  if (!Array.isArray(catalog.products)) {
    catalog.products = [];
    changed = true;
  }
  catalog.products = catalog.products.map((product) => {
    const next = { ...product };
    if (!Number.isFinite(next.stock)) {
      next.stock = 5;
      changed = true;
    }
    if (typeof next.showOnHome !== "boolean") {
      next.showOnHome = true;
      changed = true;
    }
    return next;
  });
  if (!Array.isArray(catalog.sales)) {
    catalog.sales = [];
    changed = true;
  }
  if (changed) {
    writeJson(CATALOG_PATH, catalog);
  }
  return catalog;
}

function loadCatalog() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(CATALOG_PATH)) {
    fs.copyFileSync(SEED_PATH, CATALOG_PATH);
  }
  return migrateCatalog(readJson(CATALOG_PATH));
}

function saveCatalog(catalog) {
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

function publicCatalog() {
  const catalog = loadCatalog();
  return {
    products: catalog.products,
    banners: catalog.banners
  };
}

function recordSale(input) {
  const catalog = loadCatalog();
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
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice,
    total: unitPrice * quantity,
    createdAt: new Date().toISOString()
  };
  catalog.sales.unshift(sale);
  saveCatalog(catalog);
  return { sale, product };
}

function adjustStock(productId, quantity) {
  const catalog = loadCatalog();
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
  saveCatalog(catalog);
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
      image: image && !isVideoPath(image) ? image : "",
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
  publicCatalog,
  recordSale,
  adjustStock,
  slugify,
  DATA_DIR
};
