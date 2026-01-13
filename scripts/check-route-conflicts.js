#!/usr/bin/env node
/**
 * Route Conflict Checker
 *
 * Detects Next.js App Router dynamic route slug conflicts.
 * Error: "You cannot use different slug names for the same dynamic path"
 *
 * Usage:
 *   node scripts/check-route-conflicts.js
 *   npm run check:routes
 */

const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', 'src', 'app');

/**
 * Recursively find all directories
 */
function getAllDirs(dir, results = []) {
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      const fullPath = path.join(dir, item.name);
      results.push(fullPath);
      getAllDirs(fullPath, results);
    }
  }

  return results;
}

/**
 * Extract dynamic slug name from directory name like [id] or [shareId]
 */
function extractSlugName(dirName) {
  const match = dirName.match(/^\[([^\]]+)\]$/);
  return match ? match[1] : null;
}

/**
 * Check for conflicting slugs at the same path level
 */
function checkRouteConflicts() {
  const allDirs = getAllDirs(APP_DIR);
  const conflicts = [];

  // Group directories by parent path
  const dirsByParent = new Map();

  for (const dir of allDirs) {
    const dirName = path.basename(dir);
    const slugName = extractSlugName(dirName);

    if (slugName) {
      const parentPath = path.dirname(dir);

      if (!dirsByParent.has(parentPath)) {
        dirsByParent.set(parentPath, []);
      }

      dirsByParent.get(parentPath).push({
        fullPath: dir,
        dirName,
        slugName,
      });
    }
  }

  // Check for conflicts within each parent
  for (const [parentPath, slugDirs] of dirsByParent) {
    if (slugDirs.length > 1) {
      // Multiple dynamic segments at same level
      const slugNames = new Set(slugDirs.map(d => d.slugName));

      if (slugNames.size > 1) {
        // Different slug names = conflict!
        const relativePath = path.relative(APP_DIR, parentPath);
        conflicts.push({
          path: relativePath || '(root)',
          slugs: slugDirs.map(d => ({
            name: d.slugName,
            dir: d.dirName,
          })),
        });
      }
    }
  }

  return conflicts;
}

// Main
function main() {
  console.log('🔍 Checking for Next.js route conflicts...\n');

  const conflicts = checkRouteConflicts();

  if (conflicts.length === 0) {
    console.log('✅ No route conflicts found!\n');
    process.exit(0);
  } else {
    console.error('❌ Route conflicts detected!\n');

    for (const conflict of conflicts) {
      console.error(`  Path: ${conflict.path}/`);
      console.error('  Conflicting slugs:');
      for (const slug of conflict.slugs) {
        console.error(`    - ${slug.dir} (slug: "${slug.name}")`);
      }
      console.error('');
    }

    console.error('Fix: Use the same slug name for dynamic segments at the same path level,');
    console.error('     or move one route to a different path.\n');

    process.exit(1);
  }
}

main();
