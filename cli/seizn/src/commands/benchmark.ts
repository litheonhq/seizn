/**
 * Benchmark Command
 *
 * seizn benchmark --top-k 10 --modes vector,hybrid
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createCLIClient } from '../client.js';

const BENCHMARK_QUERIES = [
  'What programming languages does the user prefer?',
  'User interface preferences and settings',
  'Recent conversations about project planning',
  'Personal information and background',
  'Technical decisions and architecture choices',
];

export function createBenchmarkCommand(): Command {
  const benchmark = new Command('benchmark')
    .description('Run recall benchmarks against your memory store')
    .option('--top-k <n>', 'Results per query', '10')
    .option('--modes <modes>', 'Comma-separated search modes', 'vector,hybrid,keyword')
    .option('--queries <queries>', 'Custom queries (comma-separated)')
    .action(async (opts: any) => {
      const client = createCLIClient();
      const modes = opts.modes.split(',');
      const queries = opts.queries ? opts.queries.split(',') : BENCHMARK_QUERIES;
      const topK = opts.topK;

      console.log(chalk.bold('\nSeizn Memory Benchmark\n'));
      console.log(chalk.dim(`  Queries: ${queries.length}`));
      console.log(chalk.dim(`  Modes: ${modes.join(', ')}`));
      console.log(chalk.dim(`  Top-K: ${topK}\n`));

      const results: Array<{ mode: string; query: string; count: number; avgScore: number; latencyMs: number }> = [];

      for (const mode of modes) {
        const spinner = ora(`Testing ${mode} mode...`).start();

        for (const query of queries) {
          const start = performance.now();
          try {
            const response = await client.request<{
              results: Array<{ similarity?: number; combinedScore?: number }>;
              count: number;
            }>('/memories', {
              params: { query, mode, limit: topK, threshold: '0' },
            });

            const latencyMs = Math.round(performance.now() - start);
            const scores = response.results.map((r) => r.similarity ?? r.combinedScore ?? 0);
            const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

            results.push({ mode, query, count: response.count, avgScore, latencyMs });
          } catch {
            results.push({ mode, query, count: 0, avgScore: 0, latencyMs: Math.round(performance.now() - start) });
          }
        }

        spinner.succeed(`${mode} mode complete`);
      }

      // Summary
      console.log(chalk.bold('\n--- Results ---\n'));
      console.log(
        chalk.dim(
          `${'Mode'.padEnd(10)} ${'Avg Score'.padEnd(12)} ${'Avg Results'.padEnd(14)} ${'Avg Latency'.padEnd(12)}`
        )
      );

      for (const mode of modes) {
        const modeResults = results.filter((r) => r.mode === mode);
        const avgScore = modeResults.reduce((a, r) => a + r.avgScore, 0) / modeResults.length;
        const avgCount = modeResults.reduce((a, r) => a + r.count, 0) / modeResults.length;
        const avgLatency = modeResults.reduce((a, r) => a + r.latencyMs, 0) / modeResults.length;

        console.log(
          `${chalk.cyan(mode.padEnd(10))} ${avgScore.toFixed(3).padEnd(12)} ${avgCount.toFixed(1).padEnd(14)} ${Math.round(avgLatency)}ms`
        );
      }

      console.log('');
    });

  return benchmark;
}
