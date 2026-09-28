const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function loadEnv(envPath) {
  if (!fs.existsSync(envPath) || fs.statSync(envPath).isDirectory()) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv(path.join(ROOT, ".env"));
loadEnv(path.join(ROOT, ".env", "env.txt"));

const store = require("../server/store");

const banners = [
  {
    id: "banner-1",
    type: "video",
    image: "",
    video: "assets/uploads/1789006662473-a6b2a66001d1.mp4",
    title: "Peças com presença",
    alt: "Peças com presença"
  },
  {
    id: "banner-2",
    type: "image",
    image: "assets/uploads/1789006221907-6d22847bc48c.png",
    video: "",
    title: "Correntes, anéis e pulseiras",
    alt: "Correntes, anéis e pulseiras"
  },
  {
    id: "banner-3",
    type: "image",
    image: "assets/uploads/1789006231625-a1c6905aa6cb.png",
    video: "",
    title: "Novidades da temporada",
    alt: "Novidades da temporada"
  },
  {
    id: "banner-4",
    type: "image",
    image: "assets/uploads/1789006241789-418ef94f2e92.png",
    video: "",
    title: "",
    alt: "Banner"
  },
  {
    id: "banner-5",
    type: "image",
    image: "assets/uploads/1789006269249-590921303f49.png",
    video: "",
    title: "",
    alt: "Banner"
  }
];

async function main() {
  const catalog = await store.loadCatalog();
  const productCount = catalog.products.length;
  const clientCount = catalog.clients.length;
  catalog.banners = banners.map((banner, index) => store.normalizeBanner(banner, index));
  await store.saveCatalog(catalog);
  const saved = await store.loadCatalog();
  if (saved.products.length !== productCount || saved.clients.length !== clientCount) {
    throw new Error("A restauração alterou produtos ou clientes.");
  }
  console.log(saved.banners.map((banner) => `${banner.type} ${banner.video || banner.image}`).join("\n"));
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
