const crypto = require("crypto");
const path = require("path");
const { getSupabase, useSupabase } = require("./supabase");

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "media";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const DEFAULT_MAX_BANNER_VIDEO_MB = 50;

function getMaxBannerVideoBytes() {
  const fromEnv = Number(process.env.MAX_BANNER_VIDEO_MB);
  const maxMb = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_BANNER_VIDEO_MB;
  return Math.floor(maxMb * 1024 * 1024);
}

function getMaxBannerVideoLabel() {
  return `${Math.round(getMaxBannerVideoBytes() / (1024 * 1024))} MB`;
}

function canUseStorage() {
  return useSupabase();
}

function guessExtension(originalName, mimetype) {
  const ext = path.extname(originalName || "").toLowerCase();
  if (ext) return ext;
  if (mimetype === "image/jpeg") return ".jpg";
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "video/webm") return ".webm";
  if (mimetype === "video/quicktime") return ".mov";
  return ".mp4";
}

function resolveMimetype(mimetype, originalName) {
  const cleanType = String(mimetype || "").trim().toLowerCase();
  if (cleanType && cleanType !== "application/octet-stream") {
    return cleanType;
  }
  const ext = path.extname(originalName || "").toLowerCase();
  const byExt = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime"
  };
  return byExt[ext] || cleanType || "application/octet-stream";
}

function validateUpload({ mimetype, size, allowVideo, maxBytes }) {
  const allowed = new Set(allowVideo ? [...IMAGE_TYPES, ...VIDEO_TYPES] : [...IMAGE_TYPES]);
  if (!allowed.has(mimetype)) {
    throw new Error(allowVideo ? "Envie JPG, PNG, WEBP, MP4 ou WEBM." : "Envie apenas JPG, PNG ou WEBP.");
  }
  if (size > maxBytes) {
    throw new Error(
      allowVideo
        ? `Vídeo grande demais. Máximo ${Math.round(maxBytes / (1024 * 1024))} MB. Comprima o MP4 (720p) e tente de novo.`
        : "Imagem pode ter no máximo 5 MB."
    );
  }
}

function buildObjectPath(originalName, mimetype) {
  const ext = guessExtension(originalName, mimetype);
  const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm", ".mov"].includes(ext) ? ext : ".bin";
  return `uploads/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt === ".jpeg" ? ".jpg" : safeExt}`;
}

function publicUrl(objectPath) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

function mediaType(mimetype) {
  return String(mimetype || "").startsWith("video/") ? "video" : "image";
}

async function ensureBucket() {
  const supabase = getSupabase();
  const fileSizeLimit = getMaxBannerVideoBytes();
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  const exists = (data || []).some((bucket) => bucket.id === BUCKET || bucket.name === BUCKET);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw createError;
    }
    return;
  }
  const { error: updateError } = await supabase.storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit
  });
  if (updateError && !/already exists/i.test(updateError.message)) {
    throw updateError;
  }
}

async function createSignedUpload({ originalName, mimetype, size, allowVideo, maxBytes }) {
  mimetype = resolveMimetype(mimetype, originalName);
  validateUpload({ mimetype, size, allowVideo, maxBytes });
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase não configurado para upload.");
  }
  await ensureBucket();
  const objectPath = buildObjectPath(originalName, mimetype);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(objectPath);
  if (error) throw error;
  return {
    uploadUrl: data.signedUrl,
    path: objectPath,
    url: publicUrl(objectPath),
    mediaType: mediaType(mimetype)
  };
}

async function uploadBuffer({ buffer, originalName, mimetype, allowVideo, maxBytes }) {
  validateUpload({ mimetype, size: buffer.length, allowVideo, maxBytes });
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase não configurado para upload.");
  }
  await ensureBucket();
  const objectPath = buildObjectPath(originalName, mimetype);
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: mimetype,
    upsert: true
  });
  if (error) throw error;
  return {
    url: publicUrl(objectPath),
    mediaType: mediaType(mimetype)
  };
}

module.exports = {
  canUseStorage,
  createSignedUpload,
  uploadBuffer,
  getMaxBannerVideoBytes,
  getMaxBannerVideoLabel
};
