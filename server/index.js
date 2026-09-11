const path = require("path");
const os = require("os");
const crypto = require("crypto");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const IS_SERVERLESS = Boolean(process.env.VERCEL);
const PORT = Number(process.env.PORT) || 3480;

if (IS_SERVERLESS && !process.env.DATA_DIR) {
  process.env.DATA_DIR = path.join(os.tmpdir(), "lb-jewelry-data");
}

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const store = require("./store");
const storage = require("./storage");

const UPLOAD_DIR = IS_SERVERLESS
  ? path.join(os.tmpdir(), "lb-jewelry-uploads")
  : path.join(SITE_DIR, "assets", "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(store.DATA_DIR, { recursive: true });

function randomSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function ensureAdmin() {
  loadEnvFile();
  let admin = store.loadAdmin();
  if (admin?.passwordHash) return admin;

  const user = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASSWORD || `LB-${crypto.randomBytes(4).toString("hex")}`;
  admin = {
    user,
    passwordHash: bcrypt.hashSync(password, 12)
  };
  store.saveAdmin(admin);

  if (!IS_SERVERLESS) {
    const credsPath = path.join(store.DATA_DIR, ".admin-credentials.txt");
    fs.writeFileSync(
      credsPath,
      `usuario=${user}\nsenha=${password}\n\nTroque esta senha depois do primeiro acesso.\n`
    );
  }
  console.log("\n========================================");
  console.log("Acesso do administrador criado:");
  console.log(`  usuario: ${user}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`  senha:   ${password}`);
  }
  console.log("  painel:  /admin");
  console.log("========================================\n");
  return admin;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function makeUploader({ allowVideo, maxBytes }) {
  const allowed = new Set(allowVideo ? [...IMAGE_TYPES, ...VIDEO_TYPES] : [...IMAGE_TYPES]);
  return multer({
    storage: multer.diskStorage({
      destination: UPLOAD_DIR,
      filename(_req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const imageExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
        const videoExt = [".mp4", ".webm", ".mov"].includes(ext);
        let safeExt = ".jpg";
        if (allowVideo && (VIDEO_TYPES.has(file.mimetype) || videoExt)) {
          safeExt = ext === ".mov" ? ".mov" : ext === ".webm" ? ".webm" : ".mp4";
        } else if (imageExt) {
          safeExt = ext === ".jpeg" ? ".jpg" : ext;
        }
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
      }
    }),
    limits: { fileSize: maxBytes },
    fileFilter(_req, file, cb) {
      if (!allowed.has(file.mimetype)) {
        cb(new Error(allowVideo ? "Envie JPG, PNG, WEBP, MP4 ou WEBM." : "Envie apenas JPG, PNG ou WEBP."));
        return;
      }
      cb(null, true);
    }
  });
}

const uploadImage = makeUploader({ allowVideo: false, maxBytes: 5 * 1024 * 1024 });
const uploadBanner = makeUploader({ allowVideo: true, maxBytes: 80 * 1024 * 1024 });

const loginAttempts = new Map();

function loginLimited(req, res, next) {
  const ip = req.ip || "local";
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + 15 * 60 * 1000;
  }
  if (record.count >= 30) {
    res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos." });
    return;
  }
  req.loginRecord = record;
  loginAttempts.set(ip, record);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.admin) {
    res.status(401).json({ error: "Sessão expirada. Entre novamente." });
    return;
  }
  next();
}

async function createApp() {
  const adminAccount = await ensureAdmin();
  const app = express();

  app.disable("x-powered-by");
  if (IS_SERVERLESS) {
    app.set("trust proxy", 1);
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      name: "lb.sid",
      secret: process.env.SESSION_SECRET || randomSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_SERVERLESS,
        maxAge: 8 * 60 * 60 * 1000
      }
    })
  );

  app.get("/api/catalog", async (_req, res) => {
    try {
      res.json(await store.publicCatalog());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const catalog = await store.loadCatalog();
      const product = catalog.products.find((item) => item.id === req.params.id);
      if (!product) {
        res.status(404).json({ error: "Produto não encontrado." });
        return;
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/login", loginLimited, (req, res) => {
    const user = String(req.body?.user || "").trim();
    const password = String(req.body?.password || "");
    const validUser = user === adminAccount.user;
    const validPass = bcrypt.compareSync(password, adminAccount.passwordHash);
    if (!validUser || !validPass) {
      req.loginRecord.count += 1;
      res.status(401).json({ error: "Usuário ou senha inválidos." });
      return;
    }
    req.loginRecord.count = 0;
    req.session.admin = { user: adminAccount.user };
    res.json({ ok: true, user: adminAccount.user });
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("lb.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/admin/me", (req, res) => {
    if (!req.session?.admin) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }
    res.json({ user: req.session.admin.user });
  });

  app.get("/api/admin/store", requireAdmin, async (_req, res) => {
    try {
      res.json(await store.loadCatalog());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/sales", requireAdmin, async (req, res) => {
    try {
      res.status(201).json(await store.recordSale(req.body));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/fiado", requireAdmin, async (req, res) => {
    try {
      res.status(201).json(await store.recordFiadoSale(req.body));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/fiado/:id/payments", requireAdmin, async (req, res) => {
    try {
      res.json(await store.recordFiadoPayment(req.params.id, req.body));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/clients", requireAdmin, async (req, res) => {
    try {
      res.status(201).json(await store.saveClient(req.body));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    try {
      res.json(await store.saveClient(req.body, req.params.id));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    try {
      res.json(await store.deleteClient(req.params.id));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/stock", requireAdmin, async (req, res) => {
    try {
      const product = await store.adjustStock(req.body?.productId, req.body?.quantity);
      res.json(product);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const catalog = await store.loadCatalog();
      const product = store.normalizeProduct(req.body);
      if (catalog.products.some((item) => item.id === product.id)) {
        product.id = `${product.id}-${Date.now().toString(36)}`;
      }
      catalog.products.push(product);
      await store.saveCatalog(catalog);
      res.status(201).json(product);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const catalog = await store.loadCatalog();
      const index = catalog.products.findIndex((item) => item.id === req.params.id);
      if (index === -1) {
        res.status(404).json({ error: "Produto não encontrado." });
        return;
      }
      const product = store.normalizeProduct(req.body, req.params.id);
      catalog.products[index] = product;
      await store.saveCatalog(catalog);
      res.json(product);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const catalog = await store.loadCatalog();
      const next = catalog.products.filter((item) => item.id !== req.params.id);
      if (next.length === catalog.products.length) {
        res.status(404).json({ error: "Produto não encontrado." });
        return;
      }
      catalog.products = next;
      await store.saveCatalog(catalog);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/admin/banners", requireAdmin, async (req, res) => {
    try {
      const banners = Array.isArray(req.body?.banners) ? req.body.banners : [];
      if (!banners.length) {
        throw new Error("Inclua pelo menos um banner.");
      }
      const catalog = await store.loadCatalog();
      catalog.banners = banners.map(store.normalizeBanner);
      await store.saveCatalog(catalog);
      res.json({ banners: catalog.banners });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/upload-url", requireAdmin, async (req, res) => {
    try {
      if (!storage.canUseStorage()) {
        res.status(501).json({ error: "Upload remoto indisponível neste ambiente." });
        return;
      }
      const allowVideo = req.query.media === "banner";
      const maxBytes = allowVideo ? 80 * 1024 * 1024 : 5 * 1024 * 1024;
      const payload = await storage.createSignedUpload({
        originalName: req.body?.filename,
        mimetype: req.body?.contentType,
        size: Number(req.body?.size || 0),
        allowVideo,
        maxBytes
      });
      res.json(payload);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/upload", requireAdmin, (req, res) => {
    const allowVideo = req.query.media === "banner";
    const maxBytes = allowVideo ? 80 * 1024 * 1024 : 5 * 1024 * 1024;
    const uploader = allowVideo ? uploadBanner : uploadImage;
    uploader.single("file")(req, res, async (error) => {
      if (error) {
        const tooBig = error.code === "LIMIT_FILE_SIZE";
        res.status(400).json({
          error: tooBig
            ? (allowVideo ? "Arquivo pode ter no máximo 80 MB." : "Imagem pode ter no máximo 5 MB.")
            : error.message
        });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado." });
        return;
      }
      try {
        if (storage.canUseStorage() && IS_SERVERLESS) {
          const fsPromises = require("fs/promises");
          const buffer = await fsPromises.readFile(req.file.path);
          const payload = await storage.uploadBuffer({
            buffer,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            allowVideo,
            maxBytes
          });
          res.json(payload);
          return;
        }
        res.json({
          url: `assets/uploads/${req.file.filename}`,
          mediaType: req.file.mimetype.startsWith("video/") ? "video" : "image"
        });
      } catch (uploadError) {
        res.status(400).json({ error: uploadError.message });
      }
    });
  });

  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(SITE_DIR, "admin.html"));
  });

  app.use("/assets/uploads", express.static(UPLOAD_DIR));
  app.use(express.static(SITE_DIR));

  app.get("/produto", (_req, res) => {
    res.sendFile(path.join(SITE_DIR, "produto.html"));
  });

  return app;
}

const appPromise = createApp();

module.exports = async (req, res) => {
  const app = await appPromise;
  return app(req, res);
};

if (require.main === module) {
  appPromise
    .then((app) => {
      app.listen(PORT, () => {
        console.log(`LB jewelry em http://localhost:${PORT}`);
        console.log(`Painel admin em http://localhost:${PORT}/admin`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
