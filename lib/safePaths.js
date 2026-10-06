// lib/safePaths.js
// Confine client-supplied file paths / web paths to an allowlist of directories.
// Never pass a client string to fs or a child process without going through here.

const fs = require("fs");
const path = require("path");

const IS_WIN = process.platform === "win32";
const norm = (p) => (IS_WIN ? p.toLowerCase() : p);

function publicDir() {
  return path.resolve(process.cwd(), "public");
}

/** Absolute directories under public/ for the given sub-folder names. */
function publicRoots(...subdirs) {
  return subdirs.map((d) => path.resolve(publicDir(), d));
}

function isInside(resolved, root) {
  const r = norm(resolved);
  const base = norm(root);
  return r === base || r.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
}

/** Follow symlinks when the target exists so a link cannot escape the root. */
function realIfExists(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Resolve a client-supplied path. Strings starting with "/" are treated as web
 * paths under public/ (e.g. "/cutouts/a.png"); anything else is resolved against
 * the project root (e.g. "public/uploads/a.jpg"). Returns the absolute disk path
 * only if it lies inside one of `roots` (or equals one of `exactFiles`);
 * otherwise null.
 */
function resolveConfined(candidate, roots, exactFiles = []) {
  if (typeof candidate !== "string" || !candidate || candidate.includes("\0")) return null;
  // Reject Windows drive/UNC absolutes and anything that is not a plain web/relative path.
  const isWebPath = candidate.startsWith("/") && !candidate.startsWith("//");
  if (candidate.startsWith("//") || candidate.startsWith("\\\\")) return null;
  const abs = isWebPath
    ? path.resolve(publicDir(), "." + candidate)
    : path.resolve(process.cwd(), candidate);
  const real = realIfExists(abs);
  const realRoots = roots.map(realIfExists);
  if (realRoots.some((root) => isInside(real, root)) && roots.some((root) => isInside(abs, root))) return abs;
  if (exactFiles.some((f) => norm(path.resolve(f)) === norm(abs)) && fs.existsSync(abs)) return abs;
  return null;
}

module.exports = { resolveConfined, publicRoots, publicDir, isInside };
