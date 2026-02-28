#!/usr/bin/env node
'use strict';

// Walks scripts/ directory, parses @-directives from each .sh file,
// and generates manifest.json at the repo root.
//
// Usage: node tools/build-manifest.js
// Runs automatically via GitHub Actions on push to main.

const fs = require('node:fs');
const path = require('node:path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const MANIFEST_PATH = path.join(__dirname, '..', 'manifest.json');

// Inline parser (same logic as scriptix CLI lib/parser.js)
const DIRECTIVE_RE = /^#\s*@(\w+)\s+(.*)/;
const ARG_RE = /^(\w[\w-]*)\s+(string|number|boolean)\s+"([^"]+)"(?:\s+(\?|\.\.\.|(=.+)))?$/;
const ENV_RE = /^(\w+)(?:\s+"([^"]+)")?$/;

function parseScript(content) {
  const lines = content.split('\n');
  const meta = {
    name: null,
    description: null,
    args: [],
    deps: [],
    envs: [],
    output: 'text',
    header: [],
    category: null,
    tags: [],
    author: null,
    platform: 'all',
    examples: [],
    stdin: false,
    version: null,
  };

  let seenDirective = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#!')) continue;

    const match = trimmed.match(DIRECTIVE_RE);
    if (!match) {
      if (seenDirective && trimmed !== '' && !trimmed.startsWith('#')) break;
      continue;
    }

    seenDirective = true;
    const [, directive, rawValue] = match;
    const value = rawValue.trim();

    switch (directive) {
      case 'name': meta.name = value; break;
      case 'description': meta.description = value; break;
      case 'arg': {
        const m = value.match(ARG_RE);
        if (m) {
          meta.args.push({
            name: m[1], type: m[2], description: m[3],
            required: !m[4],
            ...(m[4] === '...' ? { variadic: true } : {}),
            ...(m[5] ? { default: m[5].slice(1) } : {}),
          });
        }
        break;
      }
      case 'dep': meta.deps.push(value); break;
      case 'env': {
        const em = value.match(ENV_RE);
        if (em) meta.envs.push(em[1]);
        break;
      }
      case 'output': meta.output = value; break;
      case 'header': meta.header = value.split(/\s+/); break;
      case 'category': meta.category = value; break;
      case 'tag': meta.tags.push(value); break;
      case 'author': meta.author = value; break;
      case 'platform': meta.platform = value; break;
      case 'example': meta.examples.push(value); break;
      case 'stdin': meta.stdin = value === 'true'; break;
      case 'version': meta.version = value; break;
    }
  }

  return meta;
}

function walkDir(dir, base) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walkDir(fullPath, base));
    } else if (entry.name.endsWith('.sh') && !entry.name.startsWith('_')) {
      const relativePath = path.relative(base, fullPath);
      entries.push({ fullPath, relativePath });
    }
  }
  return entries;
}

function buildManifest() {
  const scripts = {};
  const errors = [];
  const repoRoot = path.join(__dirname, '..');
  const entries = walkDir(SCRIPTS_DIR, repoRoot);

  for (const { fullPath, relativePath } of entries) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const meta = parseScript(content);

    if (!meta.name) {
      errors.push(`${relativePath}: missing @name`);
      continue;
    }
    if (!meta.description) {
      errors.push(`${relativePath}: missing @description`);
      continue;
    }

    scripts[meta.name] = {
      name: meta.name,
      description: meta.description,
      args: meta.args,
      deps: meta.deps,
      envs: meta.envs,
      output: meta.output,
      header: meta.header,
      category: meta.category,
      tags: meta.tags,
      author: meta.author,
      platform: meta.platform,
      examples: meta.examples,
      path: relativePath,
      version: meta.version,
    };
  }

  const manifest = {
    version: 1,
    updated: new Date().toISOString(),
    scripts,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  const count = Object.keys(scripts).length;
  console.log(`Built manifest.json: ${count} script(s)`);

  if (errors.length > 0) {
    console.error(`\nWarnings:`);
    for (const e of errors) console.error(`  - ${e}`);
  }

  return manifest;
}

buildManifest();
