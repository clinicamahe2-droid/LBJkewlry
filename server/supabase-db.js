const { getSupabase } = require("./supabase");

function throwIfError(error) {
  if (error) {
    throw new Error(error.message || "Erro ao acessar o Supabase.");
  }
}

function productToRow(product, columns = {}) {
  const row = {
    id: product.id,
    name: product.name,
    category: product.category,
    category_slug: product.categorySlug,
    collection: product.collection,
    badge: product.badge,
    price_min: product.priceMin,
    price_max: product.priceMax,
    price_list: product.priceList ?? null,
    stock: product.stock,
    show_on_home: product.showOnHome !== false,
    image: product.image,
    images: product.images || [],
    thickness: product.thickness || [],
    description: product.description || "",
    details: product.details || []
  };
  if (columns.cost) row.cost = Number(product.cost) || 0;
  if (columns.sku) row.sku = product.sku || "";
  if (columns.active) row.active = product.active !== false;
  return row;
}

function productFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    categorySlug: row.category_slug,
    collection: row.collection,
    badge: row.badge || null,
    priceMin: Number(row.price_min),
    priceMax: Number(row.price_max),
    priceList: row.price_list != null ? Number(row.price_list) : undefined,
    stock: Number(row.stock),
    showOnHome: row.show_on_home !== false,
    image: row.image,
    images: row.images || [],
    thickness: row.thickness || [],
    description: row.description || "",
    details: row.details || [],
    cost: row.cost != null ? Number(row.cost) : 0,
    sku: row.sku || "",
    active: row.active !== false
  };
}

function bannerToRow(banner, index) {
  return {
    id: banner.id,
    type: banner.type || "image",
    title: banner.title || "",
    alt: banner.alt || "",
    image: banner.image || "",
    video: banner.video || "",
    sort_order: index
  };
}

function bannerFromRow(row) {
  const type = row.type || "image";
  return {
    id: row.id,
    type,
    title: row.title || "",
    alt: row.alt || "",
    image: row.image || "",
    video: row.video || ""
  };
}

function clientToRow(client) {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    notes: client.notes || "",
    created_at: client.createdAt || new Date().toISOString()
  };
}

function clientToRowWithColumns(client, columns = {}) {
  const row = clientToRow(client);
  if (columns.address) row.address = client.address || "";
  return row;
}

function clientFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes || "",
    address: row.address || "",
    createdAt: row.created_at
  };
}

function saleToRow(sale, columns = {}) {
  const row = {
    id: sale.id,
    type: sale.type || "cash",
    fiado_id: sale.fiadoId || null,
    client_id: sale.clientId || null,
    client_name: sale.clientName || null,
    product_id: sale.productId || null,
    product_name: sale.productName || null,
    quantity: sale.quantity ?? 0,
    unit_price: sale.unitPrice ?? 0,
    total: sale.total ?? 0,
    paid_at_sale: sale.paidAtSale ?? null,
    created_at: sale.createdAt || new Date().toISOString()
  };
  if (columns.unitCost) row.unit_cost = Number(sale.unitCost) || 0;
  if (columns.paymentMethod) row.payment_method = sale.paymentMethod || "";
  if (columns.notes) row.notes = sale.notes || "";
  return row;
}

function saleFromRow(row) {
  return {
    id: row.id,
    type: row.type || "cash",
    fiadoId: row.fiado_id || undefined,
    clientId: row.client_id || undefined,
    clientName: row.client_name || undefined,
    productId: row.product_id || undefined,
    productName: row.product_name || undefined,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    total: Number(row.total),
    paidAtSale: row.paid_at_sale != null ? Number(row.paid_at_sale) : undefined,
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : 0,
    paymentMethod: row.payment_method || "",
    notes: row.notes || "",
    createdAt: row.created_at
  };
}

function fiadoToRow(entry, columns = {}) {
  const row = {
    id: entry.id,
    client_id: entry.clientId || null,
    client_name: entry.clientName,
    client_phone: entry.clientPhone || "",
    product_id: entry.productId || null,
    product_name: entry.productName,
    quantity: entry.quantity ?? 1,
    unit_price: entry.unitPrice ?? 0,
    total: entry.total ?? 0,
    paid: entry.paid ?? 0,
    balance: entry.balance ?? 0,
    next_due_date: entry.nextDueDate || null,
    installment_amount: entry.installmentAmount ?? null,
    status: entry.status || "open",
    notes: entry.notes || "",
    payments: entry.payments || [],
    created_at: entry.createdAt || new Date().toISOString()
  };
  if (columns.unitCost) row.unit_cost = Number(entry.unitCost) || 0;
  if (columns.paymentMethod) row.payment_method = entry.paymentMethod || "";
  return row;
}

function fiadoFromRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientPhone: row.client_phone || "",
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    total: Number(row.total),
    paid: Number(row.paid),
    balance: Number(row.balance),
    nextDueDate: row.next_due_date || "",
    installmentAmount: row.installment_amount != null ? Number(row.installment_amount) : 0,
    status: row.status || "open",
    notes: row.notes || "",
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : 0,
    paymentMethod: row.payment_method || "",
    payments: row.payments || [],
    createdAt: row.created_at
  };
}

function prospectToRow(prospect) {
  return {
    id: prospect.id,
    name: prospect.name,
    phone: prospect.phone,
    coupon_code: prospect.couponCode,
    created_at: prospect.createdAt || new Date().toISOString()
  };
}

function prospectFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    couponCode: row.coupon_code,
    createdAt: row.created_at
  };
}

const columnCache = new Map();
const MISSING_COLUMN_RECHECK_MS = 60 * 1000;

// "Existe" fica guardado de vez; "não existe" é conferido de novo a cada minuto,
// para o servidor perceber uma coluna criada no Supabase sem precisar reiniciar.
async function hasColumn(table, column) {
  const key = `${table}.${column}`;
  const cached = columnCache.get(key);
  if (cached && (cached.ok || Date.now() - cached.at < MISSING_COLUMN_RECHECK_MS)) return cached.ok;
  const { error } = await getSupabase().from(table).select(column).limit(1);
  const ok = !error;
  columnCache.set(key, { ok, at: Date.now() });
  return ok;
}

// Campos que vivem em colunas próprias quando elas existem. Sem a coluna, o valor
// fica no settings.ops_extras (um único JSON compartilhado).
const EXTRA_FIELDS = {
  products: [
    ["cost", "productCost", (item) => Number(item.cost) || 0],
    ["sku", "productSku", (item) => item.sku || ""],
    ["active", "productActive", (item) => item.active !== false]
  ],
  sales: [
    ["unitCost", "saleCost", (item) => Number(item.unitCost) || 0],
    ["paymentMethod", "salePay", (item) => item.paymentMethod || ""],
    ["notes", "saleNotes", (item) => item.notes || ""]
  ],
  fiado: [
    ["unitCost", "fiadoCost", (item) => Number(item.unitCost) || 0],
    ["paymentMethod", "fiadoPay", (item) => item.paymentMethod || ""]
  ],
  clients: [
    ["address", "clientAddress", (item) => item.address || ""]
  ]
};

function missingFields(section, columns) {
  return EXTRA_FIELDS[section].filter(([, flag]) => !columns[flag]);
}

function collectOpsExtras(catalog, columns = {}) {
  const extras = {};
  for (const section of Object.keys(EXTRA_FIELDS)) {
    const missing = missingFields(section, columns);
    extras[section] = {};
    if (!missing.length) continue;
    for (const item of catalog[section] || []) {
      extras[section][item.id] = Object.fromEntries(missing.map(([field, , read]) => [field, read(item)]));
    }
  }
  return extras;
}

function applyOpsExtras(catalog, extras, columns = {}) {
  if (!extras || typeof extras !== "object") return catalog;
  for (const section of Object.keys(EXTRA_FIELDS)) {
    const missing = missingFields(section, columns);
    if (!missing.length) continue;
    catalog[section] = (catalog[section] || []).map((item) => {
      const extra = extras[section]?.[item.id];
      if (!extra) return item;
      const next = { ...item };
      for (const [field] of missing) {
        if (extra[field] !== undefined) next[field] = extra[field];
      }
      return next;
    });
  }
  return catalog;
}

// O catálogo é lido inteiro, alterado em memória e salvo. Para que dois aparelhos
// gravando ao mesmo tempo não apaguem o trabalho um do outro, a gravação compara
// com o que foi lido: só envia linhas alteradas e só apaga linhas que este
// pedido viu e removeu. Linhas criadas por outro pedido nunca são tocadas.
const snapshots = new WeakMap();

async function loadColumns() {
  const [productCost, productSku, productActive, clientAddress, saleCost, salePay, saleNotes, fiadoCost, fiadoPay] = await Promise.all([
    hasColumn("products", "cost"),
    hasColumn("products", "sku"),
    hasColumn("products", "active"),
    hasColumn("clients", "address"),
    hasColumn("sales", "unit_cost"),
    hasColumn("sales", "payment_method"),
    hasColumn("sales", "notes"),
    hasColumn("fiado", "unit_cost"),
    hasColumn("fiado", "payment_method")
  ]);
  return { productCost, productSku, productActive, clientAddress, saleCost, salePay, saleNotes, fiadoCost, fiadoPay };
}

function tableMappers(columns) {
  return [
    ["clients", "clients", (client) => clientToRowWithColumns(client, { address: columns.clientAddress })],
    ["products", "products", (product) => productToRow(product, {
      cost: columns.productCost,
      sku: columns.productSku,
      active: columns.productActive
    })],
    ["banners", "banners", bannerToRow],
    ["fiado", "fiado", (entry) => fiadoToRow(entry, {
      unitCost: columns.fiadoCost,
      paymentMethod: columns.fiadoPay
    })],
    ["sales", "sales", (sale) => saleToRow(sale, {
      unitCost: columns.saleCost,
      paymentMethod: columns.salePay,
      notes: columns.saleNotes
    })],
    ["prospects", "prospects", prospectToRow]
  ];
}

function rowsById(items, mapRow) {
  return new Map((items || []).map((item, index) => {
    const row = mapRow(item, index);
    return [row.id, { row, json: JSON.stringify(row) }];
  }));
}

function takeSnapshot(catalog, columns) {
  const tables = {};
  for (const [table, key, mapRow] of tableMappers(columns)) {
    tables[table] = new Map([...rowsById(catalog[key], mapRow)].map(([id, entry]) => [id, entry.json]));
  }
  return {
    tables,
    extras: collectOpsExtras(catalog, columns),
    promoPopup: JSON.stringify(catalog.promoPopup ?? null)
  };
}

// Passa o registro do que foi lido para uma cópia do catálogo (ex.: após migração).
function linkSnapshot(from, to) {
  const snapshot = snapshots.get(from);
  if (snapshot && to && to !== from) snapshots.set(to, snapshot);
  return to;
}

async function loadCatalogFromSupabase() {
  const supabase = getSupabase();
  const [productsRes, bannersRes, clientsRes, salesRes, fiadoRes, prospectsRes, settingsRes] = await Promise.all([
    supabase.from("products").select("*"),
    supabase.from("banners").select("*").order("sort_order", { ascending: true }),
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase.from("sales").select("*").order("created_at", { ascending: false }),
    supabase.from("fiado").select("*").order("created_at", { ascending: false }),
    supabase.from("prospects").select("*").order("created_at", { ascending: false }),
    supabase.from("settings").select("key, value").in("key", ["promo_popup", "ops_extras"])
  ]);

  throwIfError(productsRes.error);
  throwIfError(bannersRes.error);
  throwIfError(clientsRes.error);
  throwIfError(salesRes.error);
  throwIfError(fiadoRes.error);
  throwIfError(prospectsRes.error);
  throwIfError(settingsRes.error);

  const settings = Object.fromEntries((settingsRes.data || []).map((row) => [row.key, row.value]));
  const columns = await loadColumns();
  const catalog = applyOpsExtras({
    products: (productsRes.data || []).map(productFromRow),
    banners: (bannersRes.data || []).map(bannerFromRow),
    clients: (clientsRes.data || []).map(clientFromRow),
    sales: (salesRes.data || []).map(saleFromRow),
    fiado: (fiadoRes.data || []).map(fiadoFromRow),
    prospects: (prospectsRes.data || []).map(prospectFromRow),
    promoPopup: settings.promo_popup || null
  }, settings.ops_extras, columns);
  snapshots.set(catalog, takeSnapshot(catalog, columns));
  return catalog;
}

// Aplica em cima do ops_extras atual do banco só o que este pedido mudou,
// para não sobrescrever custos/formas de pagamento gravados por outro aparelho.
async function saveOpsExtras(catalog, before, columns) {
  const next = collectOpsExtras(catalog, columns);
  // Com todas as colunas criadas, nada vai para o ops_extras.
  if (Object.values(next).every((section) => !Object.keys(section).length)) return;
  const supabase = getSupabase();
  const { data, error } = await supabase.from("settings").select("value").eq("key", "ops_extras").maybeSingle();
  throwIfError(error);
  const current = data?.value && typeof data.value === "object" ? data.value : {};
  let changed = false;
  for (const section of Object.keys(next)) {
    const target = { ...(current[section] || {}) };
    const prev = before?.[section] || {};
    for (const [id, value] of Object.entries(next[section])) {
      if (before && JSON.stringify(prev[id]) === JSON.stringify(value)) continue;
      target[id] = value;
      changed = true;
    }
    if (before) {
      for (const id of Object.keys(prev)) {
        if (id in next[section] || !(id in target)) continue;
        delete target[id];
        changed = true;
      }
    }
    current[section] = target;
  }
  if (!changed && data) return;
  const { error: saveError } = await supabase.from("settings").upsert([{ key: "ops_extras", value: current }], { onConflict: "key" });
  throwIfError(saveError);
}

async function saveCatalogToSupabase(catalog) {
  const supabase = getSupabase();
  const columns = await loadColumns();
  const snapshot = snapshots.get(catalog);
  const removals = [];

  for (const [table, key, mapRow] of tableMappers(columns)) {
    const current = rowsById(catalog[key], mapRow);
    const before = snapshot?.tables[table];
    const payload = [...current.entries()]
      .filter(([id, entry]) => !before || before.get(id) !== entry.json)
      .map(([, entry]) => entry.row);
    if (payload.length) {
      const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
      throwIfError(error);
    }
    if (before) {
      const gone = [...before.keys()].filter((id) => !current.has(id));
      if (gone.length) removals.push([table, gone]);
    }
  }

  // Remove na ordem inversa (vendas e fiados antes de clientes e produtos).
  for (const [table, ids] of removals.reverse()) {
    const { error } = await supabase.from(table).delete().in("id", ids);
    throwIfError(error);
  }

  await saveOpsExtras(catalog, snapshot?.extras, columns);

  const promoJson = JSON.stringify(catalog.promoPopup ?? null);
  if (catalog.promoPopup && (!snapshot || snapshot.promoPopup !== promoJson)) {
    const { error } = await supabase.from("settings").upsert([{ key: "promo_popup", value: catalog.promoPopup }], { onConflict: "key" });
    throwIfError(error);
  }

  // Depois de salvo, o catálogo em memória passa a ser a nova referência.
  snapshots.set(catalog, takeSnapshot(catalog, columns));
}

module.exports = {
  loadCatalogFromSupabase,
  saveCatalogToSupabase,
  linkSnapshot
};
