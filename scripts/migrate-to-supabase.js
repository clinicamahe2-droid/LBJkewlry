/**
 * Envia o catalog.json local (ou seed) para o Supabase.
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-to-supabase.js
 */
const fs = require("fs");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const catalogPath = path.join("server", "data", "catalog.json");
const seedPath = path.join("server", "data", "seed.json");
const sourcePath = fs.existsSync(catalogPath) ? catalogPath : seedPath;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const { saveCatalogToSupabase } = require("../server/supabase-db");

async function main() {
  const catalog = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  await saveCatalogToSupabase(catalog);
  console.log(`Migrado de ${sourcePath}:`);
  console.log(`  ${catalog.products?.length || 0} produtos`);
  console.log(`  ${catalog.banners?.length || 0} banners`);
  console.log(`  ${catalog.clients?.length || 0} clientes`);
  console.log(`  ${catalog.sales?.length || 0} vendas`);
  console.log(`  ${catalog.fiado?.length || 0} fiados`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
