const { getSupabase } = require("./supabase");

function throwIfError(error) {
  if (error) {
    throw new Error(error.message || "Erro ao acessar o Supabase.");
  }
}

function productToRow(product) {
  return {
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
    details: row.details || []
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

function clientFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes || "",
    createdAt: row.created_at
  };
}

function saleToRow(sale) {
  return {
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
    createdAt: row.created_at
  };
}

function fiadoToRow(entry) {
  return {
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

async function syncTable(table, rows, mapRow) {
  const supabase = getSupabase();
  const payload = rows.map(mapRow);
  const ids = payload.map((row) => row.id);

  if (payload.length) {
    const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
    throwIfError(error);
  }

  const { data: existing, error: listError } = await supabase.from(table).select("id");
  throwIfError(listError);

  const toDelete = (existing || []).map((row) => row.id).filter((id) => !ids.includes(id));
  if (toDelete.length) {
    const { error: deleteError } = await supabase.from(table).delete().in("id", toDelete);
    throwIfError(deleteError);
  }
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
    supabase.from("settings").select("key, value").eq("key", "promo_popup").maybeSingle()
  ]);

  throwIfError(productsRes.error);
  throwIfError(bannersRes.error);
  throwIfError(clientsRes.error);
  throwIfError(salesRes.error);
  throwIfError(fiadoRes.error);
  throwIfError(prospectsRes.error);
  throwIfError(settingsRes.error);

  return {
    products: (productsRes.data || []).map(productFromRow),
    banners: (bannersRes.data || []).map(bannerFromRow),
    clients: (clientsRes.data || []).map(clientFromRow),
    sales: (salesRes.data || []).map(saleFromRow),
    fiado: (fiadoRes.data || []).map(fiadoFromRow),
    prospects: (prospectsRes.data || []).map(prospectFromRow),
    promoPopup: settingsRes.data?.value || null
  };
}

async function saveCatalogToSupabase(catalog) {
  const supabase = getSupabase();
  await syncTable("clients", catalog.clients || [], clientToRow);
  await syncTable("products", catalog.products || [], productToRow);
  await syncTable("banners", catalog.banners || [], bannerToRow);
  await syncTable("fiado", catalog.fiado || [], (entry) => fiadoToRow(entry));
  await syncTable("sales", catalog.sales || [], saleToRow);
  await syncTable("prospects", catalog.prospects || [], prospectToRow);
  if (catalog.promoPopup) {
    const { error } = await supabase.from("settings").upsert({
      key: "promo_popup",
      value: catalog.promoPopup
    }, { onConflict: "key" });
    throwIfError(error);
  }
}

module.exports = {
  loadCatalogFromSupabase,
  saveCatalogToSupabase
};
