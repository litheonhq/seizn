#!/usr/bin/env npx ts-node
/**
 * Docs Auto-Generation Pipeline
 *
 * This script:
 * 1. Scans API routes and extracts metadata from JSDoc comments
 * 2. Generates/updates the docs search index
 * 3. Outputs OpenAPI spec for API documentation
 *
 * Usage: npx ts-node scripts/generate-docs.ts
 */

import * as fs from "fs";
import * as path from "path";

interface SearchIndexItem {
  id: string;
  title: string;
  section: string;
  content: string;
  url: string;
  keywords: string[];
}

interface ApiEndpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  auth: boolean;
  rateLimit?: string;
  requestBody?: string;
  response?: string;
  tags: string[];
}

// Scan directory recursively for route.ts files
function scanRoutes(dir: string): string[] {
  const routes: string[] = [];

  function scan(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name === "route.ts") {
        routes.push(fullPath);
      }
    }
  }

  scan(dir);
  return routes;
}

// Extract JSDoc comments from route file
function extractJSDoc(content: string): Record<string, string> {
  const docs: Record<string, string> = {};

  // Match JSDoc blocks
  const jsdocRegex = /\/\*\*\s*([\s\S]*?)\s*\*\//g;
  let match;

  while ((match = jsdocRegex.exec(content)) !== null) {
    const block = match[1];

    // Extract @tags
    const tagRegex = /@(\w+)\s+([^\n@]*(?:\n(?!\s*@)[^\n]*)*)/g;
    let tagMatch;

    while ((tagMatch = tagRegex.exec(block)) !== null) {
      const [, tag, value] = tagMatch;
      docs[tag] = value.trim().replace(/\s*\*\s*/g, " ");
    }

    // Extract description (text before first @tag)
    const descMatch = block.match(/^([^@]*)/);
    if (descMatch && descMatch[1].trim()) {
      docs.description = descMatch[1].trim().replace(/\s*\*\s*/g, " ");
    }
  }

  return docs;
}

// Convert file path to API path
function filePathToApiPath(filePath: string, baseDir: string): string {
  const relative = path.relative(baseDir, filePath);
  const parts = relative.split(path.sep);

  // Remove route.ts
  parts.pop();

  // Convert [param] to :param
  return "/" + parts
    .map(p => p.replace(/\[\.\.\.(\w+)\]/, ":$1*").replace(/\[(\w+)\]/, ":$1"))
    .join("/");
}

// Detect HTTP methods from route file
function detectMethods(content: string): string[] {
  const methods: string[] = [];
  const methodRegex = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g;
  let match;

  while ((match = methodRegex.exec(content)) !== null) {
    methods.push(match[1]);
  }

  return methods;
}

// Generate search index items from endpoints
function endpointsToSearchIndex(endpoints: ApiEndpoint[]): SearchIndexItem[] {
  return endpoints.map(ep => ({
    id: `api-${ep.method.toLowerCase()}-${ep.path.replace(/[/:]/g, "-")}`,
    title: `${ep.method} ${ep.path} - ${ep.summary}`,
    section: "API Reference",
    content: ep.description,
    url: "/docs/api-reference",
    keywords: [
      ep.method.toLowerCase(),
      ...ep.path.split("/").filter(Boolean),
      ...ep.tags,
      ...(ep.summary.toLowerCase().split(" ")),
    ],
  }));
}

// Main pipeline
async function main() {
  console.log("📚 Seizn Docs Auto-Generation Pipeline\n");

  const projectRoot = path.resolve(__dirname, "..");
  const apiDir = path.join(projectRoot, "src/app/api");
  const publicDir = path.join(projectRoot, "public");
  const searchIndexPath = path.join(publicDir, "docs-search-index.json");

  // 1. Read existing search index
  console.log("1️⃣ Loading existing search index...");
  let existingIndex: { items: SearchIndexItem[] } = { items: [] };

  if (fs.existsSync(searchIndexPath)) {
    existingIndex = JSON.parse(fs.readFileSync(searchIndexPath, "utf-8"));
    console.log(`   Found ${existingIndex.items.length} existing items`);
  }

  // 2. Scan API routes
  console.log("\n2️⃣ Scanning API routes...");
  const routeFiles = scanRoutes(apiDir);
  console.log(`   Found ${routeFiles.length} route files`);

  // 3. Extract endpoint metadata
  console.log("\n3️⃣ Extracting endpoint metadata...");
  const endpoints: ApiEndpoint[] = [];

  // Define public API endpoints (not internal/admin)
  // Note: paths generated are relative to api dir, so /memories not /api/memories
  const publicApiPatterns = [
    "/memories",
    "/extract",
    "/query",
    "/summer",
    "/winter/forget",
    "/winter/rtbf",
    "/keys",
    "/rerank",
    "/traces",
    "/health",
    "/status",
  ];

  for (const routeFile of routeFiles) {
    const apiPath = filePathToApiPath(routeFile, apiDir);

    // Skip internal/admin endpoints for public docs
    const isPublic = publicApiPatterns.some(pattern =>
      apiPath.startsWith(pattern) || apiPath === pattern
    );

    if (!isPublic) continue;

    const content = fs.readFileSync(routeFile, "utf-8");
    const methods = detectMethods(content);
    const docs = extractJSDoc(content);

    for (const method of methods) {
      // Add /api prefix for the full API path
      const fullApiPath = `/api${apiPath}`;
      endpoints.push({
        method,
        path: fullApiPath,
        summary: docs.summary || `${method} ${fullApiPath}`,
        description: docs.description || `Endpoint for ${fullApiPath}`,
        auth: !content.includes("// @public") && !apiPath.includes("/demo/"),
        rateLimit: docs.rateLimit,
        requestBody: docs.requestBody,
        response: docs.response,
        tags: docs.tags?.split(",").map((t: string) => t.trim()) || [],
      });
    }
  }

  console.log(`   Extracted ${endpoints.length} public endpoints`);

  // 4. Generate new search index items
  console.log("\n4️⃣ Generating search index...");
  const apiItems = endpointsToSearchIndex(endpoints);

  // Merge with existing items (keep non-API items, replace API items)
  const nonApiItems = existingIndex.items.filter(
    item => !item.id.startsWith("api-")
  );

  const newIndex = {
    items: [...nonApiItems, ...apiItems],
  };

  // 5. Write updated search index
  console.log("\n5️⃣ Writing updated search index...");
  fs.writeFileSync(
    searchIndexPath,
    JSON.stringify(newIndex, null, 2),
    "utf-8"
  );
  console.log(`   Wrote ${newIndex.items.length} items to docs-search-index.json`);

  // 6. Generate OpenAPI spec
  console.log("\n6️⃣ Generating OpenAPI spec...");
  const openApiSpec = {
    openapi: "3.0.3",
    info: {
      title: "Seizn API",
      description: "AI Memory Infrastructure API",
      version: "1.0.0",
      contact: {
        name: "Seizn Support",
        url: "https://seizn.com",
        email: "support@seizn.com",
      },
    },
    servers: [
      { url: "https://seizn.com", description: "Production" },
      { url: "http://localhost:3000", description: "Development" },
    ],
    paths: {} as Record<string, Record<string, unknown>>,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
  };

  for (const ep of endpoints) {
    const pathKey = ep.path.replace(/:(\w+)/g, "{$1}");

    if (!openApiSpec.paths[pathKey]) {
      openApiSpec.paths[pathKey] = {};
    }

    openApiSpec.paths[pathKey][ep.method.toLowerCase()] = {
      summary: ep.summary,
      description: ep.description,
      tags: ep.tags.length > 0 ? ep.tags : ["General"],
      security: ep.auth ? [{ ApiKeyAuth: [] }] : [],
      responses: {
        "200": { description: "Success" },
        "401": { description: "Unauthorized" },
        "429": { description: "Rate Limited" },
      },
    };
  }

  const openApiPath = path.join(publicDir, "openapi.json");
  fs.writeFileSync(openApiPath, JSON.stringify(openApiSpec, null, 2), "utf-8");
  console.log(`   Wrote OpenAPI spec to openapi.json`);

  // 7. Summary
  console.log("\n✅ Docs generation complete!");
  console.log(`   - Search index: ${newIndex.items.length} items`);
  console.log(`   - OpenAPI spec: ${Object.keys(openApiSpec.paths).length} paths`);
  console.log(`   - Public endpoints: ${endpoints.length}`);
}

main().catch(console.error);
