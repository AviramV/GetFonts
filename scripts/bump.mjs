#!/usr/bin/env node
// Bump the package version and push a tag to trigger the ZXP release workflow.
//
// Usage:
//   npm run bump 1.0.1            # bump, commit, tag, push (asks to confirm)
//   npm run bump 1.0.1 --yes      # skip the confirmation prompt
//   npm run bump 1.0.1 --no-push  # bump, commit and tag locally; don't push
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import readline from "node:readline/promises";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const fail = (msg) => {
  console.error(`${RED}✖ ${msg}${RESET}`);
  process.exit(1);
};
const warn = (msg) => console.warn(`${YELLOW}⚠ ${msg}${RESET}`);

const prompt = async (q) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(q);
  rl.close();
  return answer.trim();
};

const args = process.argv.slice(2);
const noPush = args.includes("--no-push");
const skipConfirm = args.includes("--yes") || args.includes("-y");
const version = args.find((a) => !a.startsWith("-"));

if (!version) {
  fail("Usage: npm run bump <version> [--no-push] [--yes]\n  e.g. npm run bump 1.0.1");
}

// Must be MAJOR.MINOR.PATCH so it matches the release workflow's `*.*.*` tag trigger.
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`Version "${version}" must be MAJOR.MINOR.PATCH (e.g. 1.0.1) to match the release workflow trigger.`);
}

// A clean tree keeps the version commit isolated to just the bump.
if (run("git status --porcelain")) {
  fail("Working tree is not clean. Commit or stash your changes first.");
}

const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  warn(`You are on "${branch}", not "main". Release tags are normally cut from main.`);
}

if (run("git tag").split("\n").includes(version)) {
  fail(`Tag "${version}" already exists.`);
}

// A tag only triggers the workflow if the workflow file exists at that commit.
try {
  run("git cat-file -e HEAD:.github/workflows/main.yml");
} catch {
  warn(".github/workflows/main.yml is not in this commit — the tag will NOT trigger a release until the workflow is merged here.");
}

const current = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
console.log(`Bumping ${current} → ${version} on "${branch}"${noPush ? " (local only)" : ""}.`);

if (!skipConfirm && !noPush) {
  const answer = await prompt(`This will push tag "${version}" and trigger a public GitHub Release. Continue? [y/N] `);
  if (!/^y(es)?$/i.test(answer)) fail("Aborted.");
}

try {
  run(`npm version ${version} --no-git-tag-version`); // updates package.json + package-lock.json
  run("git add package.json package-lock.json");
  run(`git commit -m "${version}"`);
  run(`git tag ${version}`);
  console.log(`${GREEN}✔ Committed and tagged ${version}.${RESET}`);
} catch (err) {
  fail(`Failed while bumping: ${err.message}`);
}

if (noPush) {
  console.log(`Skipped push. To release later:\n  git push origin ${branch} && git push origin ${version}`);
} else {
  try {
    run(`git push origin ${branch}`);
    run(`git push origin ${version}`);
    console.log(`${GREEN}✔ Pushed ${branch} and tag ${version}. Watch the build under the repo's Actions tab.${RESET}`);
  } catch (err) {
    fail(`Commit and tag created locally, but push failed: ${err.message}\n  Retry with: git push origin ${branch} && git push origin ${version}`);
  }
}
