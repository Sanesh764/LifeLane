import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OverviewPage Identifier & Component Integrity', () => {
  const overviewPath = path.resolve(__dirname, '../src/pages/OverviewPage.jsx');
  const iconsPath = path.resolve(__dirname, '../src/components/common/Icons.jsx');

  test('OverviewPage file exists and is readable', () => {
    assert.ok(fs.existsSync(overviewPath), 'OverviewPage.jsx must exist');
    assert.ok(fs.existsSync(iconsPath), 'Icons.jsx must exist');
  });

  test('All icons imported by OverviewPage exist and are exported by Icons.jsx', () => {
    const overviewCode = fs.readFileSync(overviewPath, 'utf8');
    const iconsCode = fs.readFileSync(iconsPath, 'utf8');

    // Extract all exported functions/components from Icons.jsx
    const exportedFunctions = new Set(
      [...iconsCode.matchAll(/export\s+function\s+(\w+)/g)].map((m) => m[1])
    );

    // Extract icons import from Icons.jsx inside OverviewPage.jsx
    const importMatch = overviewCode.match(
      /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*Icons(?:\.jsx)?['"]/
    );
    assert.ok(importMatch, 'OverviewPage must import icons from Icons.jsx');

    const importedIcons = importMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    assert.ok(importedIcons.length > 0, 'OverviewPage must import at least one icon');

    // Ensure ArrowUpIcon is explicitly in imported icons
    assert.ok(
      importedIcons.includes('ArrowUpIcon'),
      'ArrowUpIcon must be explicitly imported to prevent runtime ReferenceError when scrolling'
    );

    // Verify all imported icons actually exist in Icons.jsx
    const missingInIcons = importedIcons.filter((icon) => !exportedFunctions.has(icon));
    assert.deepEqual(
      missingInIcons,
      [],
      `The following icons imported in OverviewPage are missing in Icons.jsx: ${missingInIcons.join(', ')}`
    );
  });

  test('All JSX tags starting with Capital letters are either imported or defined in OverviewPage', () => {
    const overviewCode = fs.readFileSync(overviewPath, 'utf8');

    // Extract all imported identifiers
    const importedIdentifiers = new Set();
    const importRegex = /import\s+(?:(\w+)|\{([^}]+)\}|\*\s+as\s+(\w+))\s+from/g;
    let match;
    while ((match = importRegex.exec(overviewCode)) !== null) {
      if (match[1]) importedIdentifiers.add(match[1]);
      if (match[2]) {
        match[2].split(',').forEach((item) => {
          const parts = item.trim().split(/\s+as\s+/);
          const name = parts[parts.length - 1].trim();
          if (name) importedIdentifiers.add(name);
        });
      }
      if (match[3]) importedIdentifiers.add(match[3]);
    }

    // Extract locally declared functions and components
    const localDecls = new Set([
      ...[...overviewCode.matchAll(/(?:function|class|const|let|var)\s+([A-Z]\w+)/g)].map((m) => m[1]),
    ]);

    // Extract all JSX element tags: <TagName or <TagName>
    const jsxTagRegex = /<([A-Z][A-Za-z0-9_]*)(?:\s|>|\/)/g;
    const usedComponents = new Set();
    while ((match = jsxTagRegex.exec(overviewCode)) !== null) {
      usedComponents.add(match[1]);
    }

    const missing = [];
    for (const comp of usedComponents) {
      if (!importedIdentifiers.has(comp) && !localDecls.has(comp)) {
        missing.push(comp);
      }
    }

    assert.deepEqual(
      missing,
      [],
      `OverviewPage contains unimported/undeclared JSX components: ${missing.join(', ')}`
    );
  });
});
