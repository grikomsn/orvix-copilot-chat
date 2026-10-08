#!/usr/bin/env node
// Model-metadata resync helper for Orvix.
// Probes the live /v1/models catalog, diffs it against the bundled managed
// metadata compiled from src/models, applies mechanical metadata refreshes,
// and can open the pull request. Judgment-only drift (display names, pricing
// estimates, fallback membership, retired-id pruning) is reported for manual
// review.
//
// Usage:
//   npm run refresh-models                              # report only
//   node scripts/refresh-models.mjs --apply             # rewrite bundled metadata
//   node scripts/refresh-models.mjs --pr                # --apply + branch/push/PR
//   node scripts/refresh-models.mjs --ci --report-file model-resync-report.md
//
// The Orvix API key is read from the gitignored .env file. Keys are never
// printed, logged, or committed.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "src/models/catalog.ts");
const START = "const MANAGED_MODEL_METADATA = new Map<string, OrvixModelMetadata>([\n";
const END = "]);\n";
const CONTEXT_CEILING = 450_000;
const CHANGESET_SUMMARY = "Resync bundled Orvix managed-model metadata with the live catalog.";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply") || argv.includes("--pr") || argv.includes("--ci");
const CREATE_PR = argv.includes("--pr");
const reportFileIdx = argv.indexOf("--report-file");
const reportPath = reportFileIdx >= 0 ? argv[reportFileIdx + 1] : undefined;
const require_ = createRequire(import.meta.url);

const report = [];
function log(line = "") {
  report.push(line);
  console.log(line);
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

function envKey(name) {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function requireBundled(relative) {
  const resolved = path.join(ROOT, "out", relative);
  if (!existsSync(resolved)) {
    const compiled = spawnSync("npm", ["run", "compile"], { cwd: ROOT, encoding: "utf8" });
    if (compiled.status) {
      console.error(compiled.stderr);
      process.exit(compiled.status ?? 1);
    }
  }
  return require_(resolved);
}

function editRegion(applyToBody) {
  const source = readFileSync(FILE, "utf8");
  const start = source.indexOf(START);
  if (start < 0) throw new Error("managed metadata region not found in catalog.ts");
  const bodyStart = start + START.length;
  const end = source.indexOf(END, bodyStart);
  if (end < 0) throw new Error("managed metadata region terminator not found in catalog.ts");
  const next = applyToBody(source.slice(bodyStart, end));
  if (next === undefined || next === source.slice(bodyStart, end)) return false;
  writeFileSync(FILE, source.slice(0, bodyStart) + next + source.slice(end));
  return true;
}

function fmtNumber(value) {
  if (!Number.isSafeInteger(value)) return String(value);
  const digits = String(value);
  if (digits.length < 5) return digits;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, "_");
}

function bundledIdsInOrder() {
  const source = readFileSync(FILE, "utf8");
  const start = source.indexOf(START);
  const end = source.indexOf(END, start);
  return [...source.slice(start, end).matchAll(/modelEntry\("([^"]+)"/g)].map((m) => m[1]);
}

function positiveInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function mergedEntries(bundled, live) {
  const order = bundledIdsInOrder();
  const added = [...live.keys()].filter((id) => !order.includes(id)).sort();
  const entries = [];
  const changes = [];
  for (const id of [...order, ...added]) {
    const baseline = bundled.getModelMetadata(id);
    const caps = live.get(id)?.capabilities ?? {};
    const maxOutputTokens = positiveInteger(caps.max_output_tokens) ?? baseline.maxOutputTokens;
    const imageInput = typeof caps.vision === "boolean" ? caps.vision : baseline.imageInput;
    const toolCalling = typeof caps.tools === "boolean" ? caps.tools : baseline.toolCalling;
    const reasoningEffort =
      typeof caps.reasoning_effort === "boolean" ? caps.reasoning_effort : baseline.reasoningEffort;
    const contextLength = positiveInteger(live.get(id)?.context_length) ?? CONTEXT_CEILING;
    const changed = maxOutputTokens !== baseline.maxOutputTokens ||
      imageInput !== baseline.imageInput ||
      toolCalling !== baseline.toolCalling ||
      reasoningEffort !== baseline.reasoningEffort ||
      contextLength !== baseline.contextLength;
    if (changed) {
      const diffs = [];
      if (maxOutputTokens !== baseline.maxOutputTokens) diffs.push(`out ${baseline.maxOutputTokens} -> ${maxOutputTokens}`);
      for (const [label, before, after] of [["image", baseline.imageInput, imageInput], ["tools", baseline.toolCalling, toolCalling], ["effort", baseline.reasoningEffort, reasoningEffort]]) {
        if (before !== after) diffs.push(`${label} ${before} -> ${after}`);
      }
      if (contextLength !== baseline.contextLength) diffs.push(`context ${baseline.contextLength} -> ${contextLength}`);
      changes.push(`${id}: ${diffs.join(", ")}`);
    }
    entries.push({ id, name: bundled.getModelMetadata(id).name, contextLength, maxOutputTokens, imageInput, toolCalling, reasoningEffort });
  }
  return { entries, added, changes };
}

function serialize(entries) {
  return entries.map(({ id, imageInput, toolCalling, reasoningEffort, maxOutputTokens, contextLength }) => {
    const flags = [imageInput, toolCalling, reasoningEffort];
    while (flags.length && flags.at(-1) === false) flags.pop();
    const flagText = flags.length ? `, ${flags.join(", ")}` : "";
    return `  modelEntry("${id}", ${fmtNumber(contextLength)}, ${fmtNumber(maxOutputTokens)}${flagText}),\n`;
  }).join("");
}

const main = async () => {
  const bundled = requireBundled("models/catalog.js");
  const apiKey = envKey("ORVIX_API_KEY");
  if (!apiKey) {
    log("ORVIX_API_KEY missing from gitignored .env; cannot probe the live catalog.");
    process.exitCode = 1;
    return;
  }
  const payload = await fetchJson("https://api.orvix.id/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const list = Array.isArray(payload) ? payload : payload.data ?? [];
  const live = new Map();
  for (const raw of list) {
    if (typeof raw?.id !== "string" || !bundled.isOrvixChatModel(raw.id)) continue;
    const id = raw.id.trim().toLowerCase();
    live.set(id, raw);
  }
  log(`Live catalog: ${live.size} chat routes`);

  const bundledOrder = bundledIdsInOrder();
  const absent = bundledOrder.filter((id) => !live.has(id));
  if (absent.length) log(`Bundled ids absent from live (left in place; prune manually if retired): ${absent.join(", ")}`);
  const missingNames = bundledOrder.filter((id) => !/^(orvix\/)?[\w.:-]+$/.test(id));
  if (missingNames.length) log(`Unrecognized bundled id casing: ${missingNames.join(", ")}`);
  for (const id of bundled.FALLBACK_MODELS) {
    if (!live.has(id)) log(`WARNING: fallback id ${id} is no longer live; swap FALLBACK_MODELS manually.`);
  }

  const { entries, added, changes } = mergedEntries(bundled, live);
  for (const change of changes) log(`Drift: ${change}`);
  for (const id of added) log(`Added managed id: ${id}`);
  if (!changes.length && !added.length) {
    log("No drift; bundled metadata already mirrors the live catalog.");
  }

  const changedFiles = [];
  if (APPLY && (changes.length || added.length)) {
    if (editRegion(() => serialize(entries))) changedFiles.push("src/models/catalog.ts");
    if (changedFiles.length) changedFiles.push(writeChangeset());
    log(`Applied updates to: ${changedFiles.join(", ")}`);
  }

  if (CREATE_PR) await createPullRequest(changedFiles);
};

function writeChangeset() {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(ROOT, ".changeset", `resync-model-metadata-${date}.md`);
  const body = `---\n"orvix-copilot-chat": patch\n---\n\n${CHANGESET_SUMMARY}\n`;
  if (!existsSync(file) || readFileSync(file, "utf8") !== body) writeFileSync(file, body);
  return path.relative(ROOT, file);
}

async function createPullRequest(changedFiles) {
  if (!changedFiles.length) {
    log("No drift to commit; skipping PR.");
    return;
  }
  const run = (name, args) => {
    const result = spawnSync(name, args, { cwd: ROOT, encoding: "utf8" });
    if (result.status) throw new Error(`${name} ${args.join(" ")} failed:\n${result.stderr}`);
    return result.stdout.trim();
  };
  const date = new Date().toISOString().slice(0, 10);
  const branch = `resync/models-${date}`;
  if (run("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") {
    throw new Error("--pr must run from a clean checkout of main");
  }
  run("git", ["checkout", "-b", branch]);
  run("git", ["add", "--", ...changedFiles]);
  run("git", ["commit", "-m", "Resync model metadata"]);
  run("git", ["push", "-u", "origin", branch]);
  const bodyPath = path.join(process.env.TMPDIR ?? "/tmp", `${path.basename(ROOT)}-${process.pid}-resync-pr.md`);
  writeFileSync(bodyPath, `${report.join("\n")}\n`);
  const created = spawnSync(
    "gh",
    ["pr", "create", "--head", branch, "--base", "main", "--title", "Resync model metadata from live sources", "--body-file", bodyPath],
    { cwd: ROOT, encoding: "utf8" },
  );
  log(created.stdout.trim() || created.stderr.trim());
  run("git", ["checkout", "main"]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

if (reportPath) {
  writeFileSync(reportPath, `${report.join("\n")}\n`);
}
