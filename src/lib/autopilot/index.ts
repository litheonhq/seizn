/**
 * Seizn Autopilot PR Bot
 *
 * Automatic PR generation for trace failures.
 *
 * Features:
 * - Trace failure detection and analysis
 * - Fix suggestion generation
 * - Automatic PR creation with code patches
 * - GitHub webhook handling
 *
 * Usage:
 *   import { getTraceAnalyzer, createPRGenerator, createCodeFixer } from '@/lib/autopilot';
 *
 *   const analyzer = getTraceAnalyzer();
 *   const analysis = await analyzer.analyze(trace);
 *
 *   const prGenerator = createPRGenerator(config);
 *   const prContext = prGenerator.generate(analysis, analysis.suggestions);
 *
 *   const codeFixer = createCodeFixer(config, githubToken);
 *   const prRecord = await codeFixer.applyFixes(prContext);
 */

export * from './types';
export * from './analyzer';
export * from './pr-generator';
export * from './code-fixer';
