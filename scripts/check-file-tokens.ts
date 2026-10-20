#!/usr/bin/env bun
/**
 * Pre-commit guard: block committing files over MAX_TOKENS estimated tokens.
 *
 * Tokens are estimated as bytes / BYTES_PER_TOKEN, so the default limit of
 * 5,000 tokens is 20,000 bytes. Only STAGED files are checked, and the size
 * measured is the staged blob (what will actually be committed), not the
 * working-tree file.
 *
 * Usage:
 *   bun scripts/check-file-tokens.ts         # check staged files (pre-commit)
 *   bun scripts/check-file-tokens.ts --all   # report every tracked file over the limit
 *
 * Bypass in an emergency:  git commit --no-verify
 * Dependency-free: only needs `bun` and `git`.
 */

const MAX_TOKENS = 5_000;
const BYTES_PER_TOKEN = 4;
const MAX_BYTES = MAX_TOKENS * BYTES_PER_TOKEN; // 20,000 bytes

// ---------------------------------------------------------------------------
// IGNORE LIST — files nobody writes by hand, so the limit does not apply.
//
// Rules:
//   * A pattern WITHOUT a "/" is matched against the file's basename
//     (e.g. "bun.lock", "*.min.*", "*.png").
//   * A pattern WITH a "/" is matched against the full repo-relative path
//     and may use "**" (e.g. "dist/**", "**/generated/**").
//   * Anything git itself treats as binary is skipped automatically, on top
//     of this list.
//
// To exempt a genuinely generated path, add a line to the relevant group.
// ---------------------------------------------------------------------------
const IGNORE_PATTERNS: string[] = [
  // --- Lockfiles ---------------------------------------------------------
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "Gemfile.lock",
  "go.sum",
  "composer.lock",
  "flake.lock",

  // --- Generated / codegen -------------------------------------------------
  "convex/_generated/**",
  "**/generated/**",
  "**/_generated/**",
  "*.gen.*",
  "routeTree.gen.ts",
  "worker-configuration.d.ts",
  "dist/**",
  "build/**",
  "out/**",

  // --- Minified bundles ----------------------------------------------------
  "*.min.*",

  // --- Test snapshots ------------------------------------------------------
  "__snapshots__/**",
  "**/__snapshots__/**",
  "*.snap",

  // --- Binaries / assets (git usually flags these as binary anyway) --------
  // images
  "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.avif", "*.ico", "*.bmp",
  "*.tiff", "*.svg", "*.psd",
  // fonts
  "*.woff", "*.woff2", "*.ttf", "*.otf", "*.eot",
  // archives
  "*.zip", "*.tar", "*.gz", "*.tgz", "*.bz2", "*.xz", "*.7z", "*.rar",
  // documents / databases
  "*.pdf", "*.db", "*.sqlite", "*.sqlite3",
  // video / audio
  "*.mp4", "*.mov", "*.avi", "*.mkv", "*.webm",
  "*.mp3", "*.wav", "*.m4a", "*.flac", "*.ogg", "*.aac", "*.opus",
  // compiled
  "*.wasm", "*.exe", "*.dll", "*.so", "*.dylib",

  // --- Repo-specific (notion-voice-notes) ----------------------------------
  "test/fixtures/**", // audio fixtures for the test harness
  ".test-cache/**", // cached harness outputs
];

// ---------------------------------------------------------------------------

type StagedFile = { path: string; oid: string; binary: boolean };

function git(args: string[], stdin?: string): string {
  const proc = Bun.spawnSync(["git", ...args], {
    stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (${proc.exitCode}): ${proc.stderr.toString().trim()}`,
    );
  }
  return proc.stdout.toString();
}

const globCache = new Map<string, Bun.Glob>();
function matches(pattern: string, filePath: string): boolean {
  let glob = globCache.get(pattern);
  if (!glob) {
    glob = new Bun.Glob(pattern);
    globCache.set(pattern, glob);
  }
  const target = pattern.includes("/") ? filePath : basename(filePath);
  return glob.match(target);
}

function basename(filePath: string): string {
  const i = filePath.lastIndexOf("/");
  return i === -1 ? filePath : filePath.slice(i + 1);
}

function isIgnored(filePath: string): boolean {
  return IGNORE_PATTERNS.some((p) => matches(p, filePath));
}

/**
 * Paths git reports as binary in `git diff --numstat -z` output.
 * Each record is "added<TAB>deleted<TAB>path" (NUL-terminated); binary files
 * show "-" for both counts. Filenames may themselves contain tabs, so the path
 * is everything after the second tab.
 */
function binaryPaths(diffArgs: string[]): Set<string> {
  const out = git(["diff", "--numstat", "--no-renames", "-z", ...diffArgs]);
  const binary = new Set<string>();
  for (const record of out.split("\0")) {
    if (!record) continue;
    const t1 = record.indexOf("\t");
    const t2 = record.indexOf("\t", t1 + 1);
    if (t1 === -1 || t2 === -1) continue;
    if (record.slice(0, t1) === "-") binary.add(record.slice(t2 + 1));
  }
  return binary;
}

/**
 * Staged files (added/copied/modified/renamed) with the OID of the staged blob.
 * `--raw -z` emits "meta NUL path NUL" pairs; meta is
 * ":srcmode dstmode srcoid dstoid status".
 */
function stagedFiles(): StagedFile[] {
  const raw = git([
    "diff", "--cached", "--raw", "--no-renames", "--diff-filter=ACMR", "-z",
  ]);
  const fields = raw.split("\0");
  const binary = binaryPaths(["--cached", "--diff-filter=ACMR"]);
  const files: StagedFile[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const meta = fields[i] ?? "";
    const path = fields[i + 1] ?? "";
    if (!meta.startsWith(":") || !path) continue;
    const oid = meta.split(" ")[3] ?? "";
    if (!oid || /^0+$/.test(oid)) continue; // nothing staged to measure
    files.push({ path, oid, binary: binary.has(path) });
  }
  return files;
}

/** Every tracked file at HEAD with its blob OID. */
function allTrackedFiles(): StagedFile[] {
  // "mode type oid<TAB>path" per NUL-terminated record.
  const out = git(["ls-tree", "-r", "-z", "HEAD"]);
  const emptyTree = git(["hash-object", "-t", "tree", "/dev/null"]).trim();
  const binary = binaryPaths([emptyTree, "HEAD"]);
  const files: StagedFile[] = [];
  for (const record of out.split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    if (tab === -1) continue;
    const [mode, type, oid] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (type !== "blob" || !oid || mode === "160000") continue;
    files.push({ path, oid, binary: binary.has(path) });
  }
  return files;
}

/** Byte size of each blob, looked up by OID so filenames never enter the query. */
function blobSizes(files: StagedFile[]): Map<string, number> {
  const sizes = new Map<string, number>();
  if (files.length === 0) return sizes;
  const out = git(
    ["cat-file", "--batch-check=%(objectsize)"],
    files.map((f) => f.oid).join("\n") + "\n",
  );
  const lines = out.split("\n");
  files.forEach((f, i) => {
    const size = Number.parseInt(lines[i] ?? "", 10);
    if (!Number.isFinite(size)) {
      throw new Error(`could not determine staged size of ${f.path} (${lines[i]})`);
    }
    sizes.set(f.path, size);
  });
  return sizes;
}

function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_TOKEN);
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function main(): number {
  const all = process.argv.includes("--all");
  const files = all ? allTrackedFiles() : stagedFiles();
  const candidates = files.filter((f) => !f.binary && !isIgnored(f.path));
  const sizes = blobSizes(candidates);

  const offenders = candidates
    .map((f) => ({ path: f.path, bytes: sizes.get(f.path) ?? Number.NaN }))
    .filter((f) => f.bytes > MAX_BYTES)
    .sort((a, b) => b.bytes - a.bytes);

  if (offenders.length === 0) {
    if (all) console.log(`All tracked files are under ${formatNumber(MAX_TOKENS)} tokens.`);
    return 0;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(
    all
      ? `Tracked files over the ${formatNumber(MAX_TOKENS)}-token limit (${offenders.length}):`
      : `COMMIT BLOCKED: ${offenders.length} staged file(s) exceed the ${formatNumber(MAX_TOKENS)}-token limit (~${formatNumber(MAX_BYTES)} bytes, tokens ≈ bytes / ${BYTES_PER_TOKEN}):`,
  );
  lines.push("");
  for (const f of offenders) {
    lines.push(
      `  ${f.path}  —  ~${formatNumber(estimateTokens(f.bytes))} tokens (${formatNumber(f.bytes)} bytes)`,
    );
  }
  if (all) {
    console.log(lines.join("\n"));
    return 1;
  }

  lines.push("");
  lines.push("Large files are hard for people and AI agents to read and edit safely.");
  lines.push("Split each file above so every resulting file stays under 5,000 tokens:");
  lines.push("");
  lines.push("  1. Split by responsibility: move each distinct concern into its own module.");
  lines.push("  2. Move types, interfaces, constants, and small helpers into their own files");
  lines.push("     (e.g. foo.types.ts, foo.constants.ts, foo.helpers.ts).");
  lines.push("  3. Extract components, classes, or sub-functions into separate files and");
  lines.push("     import them where they were used.");
  lines.push("  4. If callers depend on one import path, keep it working with an index file");
  lines.push("     that re-exports from the new modules (export * from \"./foo.helpers\").");
  lines.push("  5. Re-stage the new files and commit again.");
  lines.push("");
  lines.push("Emergency bypass (use sparingly):   git commit --no-verify");
  lines.push("");
  lines.push("Is the file genuinely generated, a lockfile, or an asset? Add its path or");
  lines.push("glob to IGNORE_PATTERNS in scripts/check-file-tokens.ts instead of bypassing.");
  lines.push("");
  console.error(lines.join("\n"));
  return 1;
}

process.exit(main());
