const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath) || fs.statSync(envPath).isDirectory()) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, ".env", "env.txt"));

const store = require("../server/store");
const storage = require("../server/storage");

const CATEGORY_LABEL = {
  correntes: "Correntes",
  brincos: "Brincos",
  pulseiras: "Pulseiras",
  aneis: "Anéis"
};

function clean(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "").trim();
}

function moneyNote(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function inferCategory(name) {
  const text = clean(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/brinco|argola/.test(text)) return "brincos";
  if (/\banel\b|alianca/.test(text)) return "aneis";
  if (/pulseir|relogio/.test(text)) return "pulseiras";
  return "correntes";
}

function inferCollection(name, categorySlug) {
  const text = clean(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/relogio/.test(text)) return "Relógios";
  if (/escapulario|crucifixo|estrela de davi|pingente/.test(text)) return "Pingentes";
  return `Coleção ${CATEGORY_LABEL[categorySlug]}`;
}

function paymentLabel(value) {
  const key = clean(value).toLowerCase();
  if (key === "pix") return "PIX";
  if (key === "dinheiro") return "Dinheiro";
  if (key === "cartao" || key === "cartão") return "Cartão";
  return clean(value);
}

function productId(id) {
  return `vf-${id}`;
}

function clientId(id) {
  return `vf-${id}`;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate || new Date().toISOString().slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function fiadoStatus(entry) {
  const balance = Math.max(0, Number(entry.total) - Number(entry.paid));
  const next = { ...entry, balance };
  if (balance <= 0) {
    next.status = "paid";
    next.nextDueDate = "";
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

async function mapPool(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return output;
}

async function savePhoto(item) {
  const raw = String(item.foto || "");
  if (!raw) return "/assets/logo-lb.png";
  const base64 = raw.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return "/assets/logo-lb.png";
  try {
    const uploaded = await storage.uploadBuffer({
      buffer,
      originalName: `vf-${item.id}.jpg`,
      mimetype: "image/jpeg",
      allowVideo: false,
      maxBytes: Math.max(buffer.length, 1024)
    });
    return uploaded.url;
  } catch (error) {
    const dir = path.join(ROOT, "site", "assets", "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const filename = `vf-${item.id}.jpg`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    console.warn(`Foto local para ${item.nome}: ${error.message}`);
    return `/assets/uploads/${filename}`;
  }
}

function saleNotes(venda) {
  const parts = [];
  if (Number(venda.descontoValor) > 0) {
    parts.push(`Desconto ${moneyNote(venda.descontoValor)}`);
  }
  if (Number(venda.descontoPercentual) > 0) {
    parts.push(`Desconto ${venda.descontoPercentual}%`);
  }
  if (Array.isArray(venda.pagamentos) && venda.pagamentos.length > 1) {
    const history = venda.pagamentos
      .map((pay) => `${paymentLabel(pay.formaPagamento) || "Pagamento"} ${moneyNote(pay.valor)}`)
      .join(" · ");
    parts.push(history);
  }
  return parts.join(" | ");
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    throw new Error("Informe o caminho do backup JSON.");
  }
  const backup = JSON.parse(fs.readFileSync(source, "utf8"));
  if (backup.format !== "vendafacil-local-backup") {
    throw new Error("Arquivo não é um backup do VendaFácil.");
  }

  const current = await store.loadCatalog();
  const reusePhotos = process.env.SKIP_PHOTOS === "1";
  const existingImages = new Map((current.products || []).map((item) => [item.id, item.image]));
  console.log(reusePhotos ? "Reaproveitando fotos já enviadas" : `Fotos: ${backup.produtos.length}`);
  const images = reusePhotos
    ? backup.produtos.map((item) => existingImages.get(productId(item.id)) || "/assets/logo-lb.png")
    : await mapPool(backup.produtos, 4, async (item, index) => {
      const url = await savePhoto(item);
      if ((index + 1) % 10 === 0) console.log(`  ${index + 1}/${backup.produtos.length}`);
      return url;
    });

  const products = backup.produtos.map((item, index) => {
    const categorySlug = inferCategory(item.nome);
    const price = cents(Math.max(0, Number(item.preco) || 0));
    const stock = Math.max(0, Math.floor(Number(item.quantidade) || 0));
    const active = item.ativo !== false;
    const image = images[index];
    return {
      id: productId(item.id),
      name: clean(item.nome),
      sku: clean(item.codigo),
      category: CATEGORY_LABEL[categorySlug],
      categorySlug,
      collection: inferCollection(item.nome, categorySlug),
      badge: null,
      priceMin: price,
      priceMax: price,
      cost: cents(Math.max(0, Number(item.custo) || 0)),
      stock,
      showOnHome: active && stock > 0,
      active,
      image,
      images: [image],
      thickness: ["Único"],
      description: clean(item.descricao),
      details: ["Importado do VendaFácil"]
    };
  });

  const knownProducts = new Set(products.map((item) => item.id));
  const clients = backup.clientes.map((item) => ({
    id: clientId(item.id),
    name: clean(item.nome) || "Cliente sem nome",
    phone: clean(item.telefone) || "sem telefone",
    address: clean(item.endereco),
    notes: clean(item.observacoes),
    createdAt: item.createdAt || new Date().toISOString()
  }));
  const knownClients = new Set(clients.map((item) => item.id));

  const sales = [];
  const fiado = [];

  for (const venda of backup.vendas) {
    const line = (venda.produtos || [])[0] || {};
    const id = productId(line.produto_id || venda.id);
    const quantity = Math.max(1, Math.floor(Number(line.quantidade) || 1));
    const unitPrice = cents(Math.max(0, Number(line.preco) || Number(venda.valorTotal) || 0));
    const unitCost = cents(Math.max(0, Number(line.custo) || 0));
    const total = cents(Math.max(0, Number(venda.valorTotal) || unitPrice * quantity));
    const pending = cents(Math.max(0, Number(venda.valorPendente) || 0));
    const createdAt = venda.created_at || `${venda.data || "2026-01-01"}T12:00:00.000Z`;
    const linkedClient = venda.cliente_id ? clientId(venda.cliente_id) : "";
    const clientName = clean(venda.cliente);
    let resolvedClientId = knownClients.has(linkedClient) ? linkedClient : "";
    if (!resolvedClientId && clientName) {
      const created = {
        id: `vf-client-${venda.id}`,
        name: clientName,
        phone: "sem telefone",
        address: "",
        notes: "",
        createdAt
      };
      clients.push(created);
      knownClients.add(created.id);
      resolvedClientId = created.id;
    }
    if (!knownProducts.has(id) && line.nome) {
      products.push({
        id,
        name: clean(line.nome),
        sku: "",
        category: "Correntes",
        categorySlug: "correntes",
        collection: "Coleção Correntes",
        badge: null,
        priceMin: unitPrice,
        priceMax: unitPrice,
        cost: unitCost,
        stock: 0,
        showOnHome: false,
        active: false,
        image: "/assets/logo-lb.png",
        images: ["/assets/logo-lb.png"],
        thickness: ["Único"],
        description: "",
        details: ["Produto citado em venda importada"]
      });
      knownProducts.add(id);
    }

    const open = venda.statusPagamento === "parcial" || pending > 0;
    const notes = saleNotes(venda);
    const method = paymentLabel(venda.formaPagamento);

    if (open) {
      const paid = cents(Math.max(0, total - pending));
      const fiadoId = `vf-fiado-${venda.id}`;
      const payments = (venda.pagamentos || [])
        .filter((pay) => Number(pay.valor) > 0)
        .map((pay) => ({
          id: `vf-${pay.id}`,
          amount: cents(pay.valor),
          paidAt: pay.data || createdAt,
          note: clean(pay.observacao) || paymentLabel(pay.formaPagamento) || "Abatimento"
        }));
      const client = clients.find((item) => item.id === resolvedClientId);
      fiado.push(fiadoStatus({
        id: fiadoId,
        clientId: resolvedClientId,
        clientName: client?.name || clientName,
        clientPhone: client?.phone || "",
        productId: id,
        productName: clean(line.nome) || "Peça",
        quantity,
        unitPrice,
        unitCost,
        paymentMethod: method,
        total,
        paid,
        balance: pending,
        nextDueDate: pending > 0 ? (venda.dataPrevisaoPendente || addDays(venda.data, 30)) : "",
        installmentAmount: 0,
        notes,
        payments,
        createdAt
      }));
      sales.push({
        id: `vf-${venda.id}`,
        type: "fiado",
        fiadoId,
        clientId: resolvedClientId,
        clientName: client?.name || clientName,
        productId: id,
        productName: clean(line.nome) || "Peça",
        quantity,
        unitPrice,
        unitCost,
        paymentMethod: method,
        total,
        paidAtSale: paid,
        notes,
        createdAt
      });
      continue;
    }

    sales.push({
      id: `vf-${venda.id}`,
      type: "cash",
      clientId: resolvedClientId || undefined,
      clientName: clientName || undefined,
      productId: id,
      productName: clean(line.nome) || "Peça",
      quantity,
      unitPrice,
      unitCost,
      paymentMethod: method,
      total,
      notes,
      createdAt
    });
  }

  sales.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  fiado.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const catalog = {
    ...current,
    products,
    clients,
    sales,
    fiado
  };

  await store.saveCatalog(catalog);
  const openFiado = fiado.filter((item) => item.status !== "paid").length;
  const stockUnits = products.reduce((sum, item) => sum + item.stock, 0);
  console.log(`Produtos ${products.length} · estoque ${stockUnits} un.`);
  console.log(`Clientes ${clients.length}`);
  console.log(`Vendas ${sales.length} · fiados em aberto ${openFiado}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
