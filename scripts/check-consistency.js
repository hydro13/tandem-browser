#!/usr/bin/env node
/**
 * Version & tool-count consistency checker.
 * Sources of truth:
 *   - version  → package.json .version
 *   - tools    → count of server.tool( in src/mcp/tools/*.ts
 *
 * Usage:
 *   node scripts/check-consistency.js          # check only
 *   node scripts/check-consistency.js --fix    # auto-update mismatches
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const fix = process.argv.includes('--fix');

// ── Sources of truth ────────────────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

// Count server.tool( across all tool files
const toolCount = Number(
  execSync('grep -r "server\\.tool(" src/mcp/tools/*.ts | wc -l', { cwd: root })
    .toString()
    .trim()
);

console.log(`Sources of truth: v${version}, ${toolCount} tools\n`);

// ── Per-file tool-count patterns ────────────────────────────────────
// Each pattern must capture the number as group 1, and the full match
// must be replaceable by swapping group 1 with the correct count.
//
// We use specific patterns per file to avoid false positives (e.g.
// TODO.md has "(7 tools)" for individual features — those are not
// the global tool count).

/** Standard prose patterns: "236 tools", "236 MCP tools", "233-tool" */
const TOOL_PROSE = /(\d{2,})(?:-tool\b|[\s]+(?:MCP\s+)?tools?\b)/g;

/** HTML stat pattern in docs: <span class="stat-num">236</span>...MCP tools */
const TOOL_HTML_STAT = /(<span class="stat-num">)(\d+)(<\/span><span class="stat-label">MCP tools)/g;

/** TODO.md summary line: "MCP server: 236 tools" */
const TOOL_TODO_SUMMARY = /MCP server: (\d+) tools/g;

// ── Files to check ──────────────────────────────────────────────────
// [path, { version?, toolPatterns?: RegExp[] }]

const targets = [
  ['package.json',          { toolPatterns: [TOOL_PROSE] }],
  ['README.md',             { toolPatterns: [TOOL_PROSE] }],
  ['PROJECT.md',            { version: true, toolPatterns: [TOOL_PROSE] }],
  ['AGENTS.md',             { toolPatterns: [TOOL_PROSE] }],
  ['skill/SKILL.md',        { toolPatterns: [TOOL_PROSE] }],
  ['docs/index.html',       { version: true, toolPatterns: [TOOL_PROSE, TOOL_HTML_STAT] }],
  ['docs/api.html',         { toolPatterns: [TOOL_HTML_STAT] }],
  ['docs/public-launch.md', { toolPatterns: [TOOL_PROSE] }],
  ['TODO.md',               { toolPatterns: [TOOL_TODO_SUMMARY] }],
];

// ── Helpers ─────────────────────────────────────────────────────────

function replaceAll(content, pattern, expectedCount) {
  const issues = [];
  // Clone regex to avoid shared lastIndex
  const re = new RegExp(pattern.source, pattern.flags);
  const newContent = content.replace(re, (...args) => {
    const full = args[0];
    // For HTML stat pattern, groups are: prefix, number, suffix
    if (pattern === TOOL_HTML_STAT) {
      const num = Number(args[2]);
      if (num !== expectedCount) {
        issues.push({ old: num });
        return args[1] + String(expectedCount) + args[3];
      }
      return full;
    }
    // For prose patterns, group 1 is the number
    const num = Number(args[1]);
    if (num !== expectedCount) {
      issues.push({ old: num });
      return full.replace(String(num), String(expectedCount));
    }
    return full;
  });
  return { content: newContent, issues };
}

function findMatches(content, pattern) {
  const re = new RegExp(pattern.source, pattern.flags);
  const matches = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    if (pattern === TOOL_HTML_STAT) {
      matches.push(Number(m[2]));
    } else {
      matches.push(Number(m[1]));
    }
  }
  return matches;
}

// ── Run checks ──────────────────────────────────────────────────────

const errors = [];

for (const [rel, checks] of targets) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    errors.push({ file: rel, issue: 'file not found' });
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Check tool counts
  if (checks.toolPatterns) {
    let totalMatches = 0;
    for (const pattern of checks.toolPatterns) {
      const matches = findMatches(content, pattern);
      totalMatches += matches.length;

      const wrong = matches.filter(n => n !== toolCount);
      if (wrong.length > 0) {
        for (const n of wrong) {
          errors.push({ file: rel, issue: `tool count ${n} → ${toolCount}` });
        }
        if (fix) {
          const result = replaceAll(content, pattern, toolCount);
          content = result.content;
          modified = true;
        }
      }
    }
    if (totalMatches === 0) {
      errors.push({ file: rel, issue: 'no tool count reference found' });
    }
  }

  // Check version
  if (checks.version) {
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`, 'g');
    if (!re.test(content)) {
      errors.push({ file: rel, issue: `version ${version} not found` });
    }
  }

  if (fix && modified) {
    fs.writeFileSync(filePath, content);
  }
}

// ── Output ──────────────────────────────────────────────────────────

if (errors.length === 0) {
  console.log(`✓ All files consistent (v${version}, ${toolCount} tools)`);
  process.exit(0);
} else {
  if (fix) {
    console.log(`Fixed ${errors.length} issue(s):`);
  } else {
    console.log(`Found ${errors.length} consistency issue(s):`);
  }
  for (const e of errors) {
    console.log(`  ✗ ${e.file}: ${e.issue}`);
  }
  if (!fix) {
    console.log('\nRun with --fix to auto-update tool counts.');
  }
  // After fixing, re-run to verify
  if (fix) {
    console.log('\nRe-checking after fix...');
    const result = spawnSync(
      process.execPath, [__filename], { stdio: 'inherit', cwd: root }
    );
    process.exit(result.status);
  }
  process.exit(1);
}
