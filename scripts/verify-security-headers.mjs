#!/usr/bin/env node
/**
 * Static guard for browser-facing security headers.
 *
 * This keeps Next.js global headers and the dashboard proxy override from
 * drifting apart. It intentionally checks for required header names and the
 * dashboard no-referrer override, not for exact formatting.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const nextConfigPath = path.join(root, 'next.config.ts');
const proxyPath = path.join(root, 'src', 'proxy.ts');

const requiredGlobalHeaders = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-DNS-Prefetch-Control',
  'X-Frame-Options',
  'Origin-Agent-Cluster',
  'Referrer-Policy',
  'Permissions-Policy',
];

const requiredCspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
];

const requiredDashboardProxyHeaders = [
  'Referrer-Policy',
  'X-Content-Type-Options',
  'X-DNS-Prefetch-Control',
  'X-Frame-Options',
  'Origin-Agent-Cluster',
];

const nextConfig = read(nextConfigPath);
const proxy = read(proxyPath);
const failures = [];

for (const header of requiredGlobalHeaders) {
  if (!nextConfig.includes(`key: '${header}'`) && !nextConfig.includes(`key: "${header}"`)) {
    failures.push(`next.config.ts missing global header: ${header}`);
  }
}

for (const directive of requiredCspDirectives) {
  if (!nextConfig.includes(directive)) {
    failures.push(`next.config.ts missing CSP directive: ${directive}`);
  }
}

if (!nextConfig.includes("value: 'no-referrer'") && !nextConfig.includes('value: "no-referrer"')) {
  failures.push('next.config.ts missing dashboard Referrer-Policy no-referrer override');
}

if (!nextConfig.includes("key: 'X-DNS-Prefetch-Control', value: 'off'")) {
  failures.push('next.config.ts must disable DNS prefetch for privacy hardening');
}

for (const header of requiredDashboardProxyHeaders) {
  if (!proxy.includes(`headers.set('${header}'`) && !proxy.includes(`headers.set("${header}"`)) {
    failures.push(`src/proxy.ts missing dashboard proxy header: ${header}`);
  }
}

if (!proxy.includes("headers.set('X-DNS-Prefetch-Control', 'off')")) {
  failures.push('src/proxy.ts must disable dashboard DNS prefetch for privacy hardening');
}

if (failures.length > 0) {
  console.error('Security header verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Security header guard passed.');

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Required file missing: ${path.relative(root, filePath)}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8');
}
