/**
 * Seizn Autopilot PR Bot - Code Fixer
 *
 * Generates code patches and applies fixes based on suggestions.
 */

import { Octokit } from '@octokit/rest';
import type {
  FixSuggestion,
  CodeChange,
  ConfigChange,
  PRContext,
  PRRecord,
  PRStatus,
  PRStatusEvent,
  AutopilotConfig,
} from './types';
import { randomUUID } from 'crypto';

// ============================================
// Types
// ============================================

interface GitHubFile {
  path: string;
  content: string;
  sha?: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
}

interface CreatePRResult {
  success: boolean;
  prNumber?: number;
  prUrl?: string;
  error?: string;
}

// ============================================
// Code Fixer Class
// ============================================

export class CodeFixer {
  private octokit: Octokit;
  private config: AutopilotConfig;

  constructor(config: AutopilotConfig, githubToken: string) {
    this.config = config;
    this.octokit = new Octokit({ auth: githubToken });
  }

  /**
   * Apply fix suggestions and create PR
   */
  async applyFixes(context: PRContext): Promise<PRRecord> {
    const prRecord = this.createPRRecord(context);

    try {
      // Create branch
      await this.createBranch(context.headBranch, context.baseBranch);

      // Update record status
      this.updateRecordStatus(prRecord, 'pending', 'autopilot', 'Branch created');

      // Commit files
      await this.commitFiles(context.headBranch, context.files, context.metadata.traceId);

      // Create PR
      const result = await this.createPullRequest(context);

      if (result.success && result.prNumber) {
        prRecord.prNumber = result.prNumber;
        prRecord.prUrl = result.prUrl;
        prRecord.status = 'created';
        this.updateRecordStatus(prRecord, 'created', 'autopilot', `PR #${result.prNumber} created`);

        // Request reviewers
        if (context.reviewers.length > 0) {
          await this.requestReviewers(result.prNumber, context.reviewers);
          prRecord.status = 'review_requested';
          this.updateRecordStatus(prRecord, 'review_requested', 'autopilot', 'Reviewers assigned');
        }

        // Add labels
        if (context.labels.length > 0) {
          await this.addLabels(result.prNumber, context.labels);
        }
      } else {
        prRecord.status = 'failed';
        prRecord.error = result.error;
        this.updateRecordStatus(prRecord, 'failed', 'autopilot', result.error || 'Unknown error');
      }
    } catch (error) {
      prRecord.status = 'failed';
      prRecord.error = error instanceof Error ? error.message : 'Unknown error';
      this.updateRecordStatus(prRecord, 'failed', 'autopilot', prRecord.error);
    }

    prRecord.updatedAt = new Date().toISOString();
    return prRecord;
  }

  /**
   * Create initial PR record
   */
  private createPRRecord(context: PRContext): PRRecord {
    const now = new Date().toISOString();
    return {
      id: `pr-${randomUUID().slice(0, 8)}`,
      status: 'pending',
      context,
      history: [{
        status: 'pending',
        timestamp: now,
        actor: 'autopilot',
        details: 'PR creation initiated',
      }],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update PR record status
   */
  private updateRecordStatus(
    record: PRRecord,
    status: PRStatus,
    actor: string,
    details?: string
  ): void {
    record.status = status;
    record.history.push({
      status,
      timestamp: new Date().toISOString(),
      actor,
      details,
    });
    record.updatedAt = new Date().toISOString();
  }

  /**
   * Create a new branch from base
   */
  private async createBranch(branchName: string, baseBranch: string): Promise<void> {
    const { owner, repo } = this.config;

    // Get base branch ref
    const { data: baseRef } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });

    // Create new branch
    try {
      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha,
      });
    } catch (error: unknown) {
      // Branch might already exist
      const err = error as { status?: number };
      if (err.status === 422) {
        // Update existing branch
        await this.octokit.git.updateRef({
          owner,
          repo,
          ref: `heads/${branchName}`,
          sha: baseRef.object.sha,
          force: true,
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Commit files to branch
   */
  private async commitFiles(
    branchName: string,
    files: PRContext['files'],
    traceId: string
  ): Promise<void> {
    const { owner, repo } = this.config;

    // Get current commit
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });

    const { data: commit } = await this.octokit.git.getCommit({
      owner,
      repo,
      commit_sha: ref.object.sha,
    });

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        });

        return {
          path: file.path,
          mode: (file.mode || '100644') as '100644' | '100755' | '040000' | '160000' | '120000',
          type: 'blob' as const,
          sha: blob.sha,
        };
      })
    );

    // Create tree
    const { data: tree } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: commit.tree.sha,
      tree: blobs,
    });

    // Create commit
    const { data: newCommit } = await this.octokit.git.createCommit({
      owner,
      repo,
      message: `fix(autopilot): apply auto-fix for trace ${traceId}

Generated by Seizn Autopilot.`,
      tree: tree.sha,
      parents: [commit.sha],
    });

    // Update branch ref
    await this.octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
      sha: newCommit.sha,
    });
  }

  /**
   * Create pull request
   */
  private async createPullRequest(context: PRContext): Promise<CreatePRResult> {
    const { owner, repo } = this.config;

    try {
      const { data: pr } = await this.octokit.pulls.create({
        owner,
        repo,
        title: context.title,
        body: context.body,
        head: context.headBranch,
        base: context.baseBranch,
        draft: context.draft,
      });

      return {
        success: true,
        prNumber: pr.number,
        prUrl: pr.html_url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create PR',
      };
    }
  }

  /**
   * Request reviewers for PR
   */
  private async requestReviewers(prNumber: number, reviewers: string[]): Promise<void> {
    const { owner, repo } = this.config;

    // Filter out invalid reviewers (can't review own PR)
    const validReviewers = reviewers.filter((r) => r !== owner);

    if (validReviewers.length > 0) {
      await this.octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: prNumber,
        reviewers: validReviewers,
      });
    }
  }

  /**
   * Add labels to PR
   */
  private async addLabels(prNumber: number, labels: string[]): Promise<void> {
    const { owner, repo } = this.config;

    // Ensure labels exist
    for (const label of labels) {
      try {
        await this.octokit.issues.createLabel({
          owner,
          repo,
          name: label,
          color: this.getLabelColor(label),
        });
      } catch {
        // Label might already exist
      }
    }

    // Add labels to PR
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels,
    });
  }

  /**
   * Get color for label
   */
  private getLabelColor(label: string): string {
    const colors: Record<string, string> = {
      autopilot: '7057ff',
      'auto-fix': '7057ff',
      'severity:critical': 'd73a4a',
      'severity:high': 'e99695',
      'severity:medium': 'fbca04',
      'severity:low': '0e8a16',
      'type:code': '1d76db',
      'type:config': 'c5def5',
      'needs-review': 'b60205',
    };

    return colors[label] || 'ededed';
  }

  /**
   * Get PR status from GitHub
   */
  async getPRStatus(prNumber: number): Promise<{
    status: PRStatus;
    checks: {
      status: 'pending' | 'success' | 'failure';
      runs: Array<{ name: string; status: string; conclusion?: string }>;
    };
  }> {
    const { owner, repo } = this.config;

    // Get PR details
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Determine status
    let status: PRStatus = 'created';
    if (pr.merged) {
      status = 'merged';
    } else if (pr.state === 'closed') {
      status = 'closed';
    } else if (pr.draft) {
      status = 'created';
    }

    // Get check runs
    const { data: checkRuns } = await this.octokit.checks.listForRef({
      owner,
      repo,
      ref: pr.head.sha,
    });

    const runs = checkRuns.check_runs.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion || undefined,
    }));

    // Determine overall check status
    let checkStatus: 'pending' | 'success' | 'failure' = 'pending';
    if (runs.every((r) => r.status === 'completed')) {
      checkStatus = runs.every((r) => r.conclusion === 'success') ? 'success' : 'failure';
    }

    // Get reviews
    const { data: reviews } = await this.octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    });

    const latestReview = reviews[reviews.length - 1];
    if (latestReview) {
      if (latestReview.state === 'APPROVED') {
        status = 'approved';
      } else if (latestReview.state === 'CHANGES_REQUESTED') {
        status = 'changes_requested';
      }
    }

    return {
      status,
      checks: {
        status: checkStatus,
        runs,
      },
    };
  }

  /**
   * Merge PR if approved and checks pass
   */
  async mergePR(prNumber: number): Promise<{ success: boolean; error?: string }> {
    const { owner, repo } = this.config;

    try {
      const status = await this.getPRStatus(prNumber);

      if (status.status !== 'approved') {
        return { success: false, error: 'PR not approved' };
      }

      if (status.checks.status !== 'success') {
        return { success: false, error: 'Checks not passing' };
      }

      await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: 'squash',
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to merge PR',
      };
    }
  }

  /**
   * Close PR without merging
   */
  async closePR(prNumber: number, reason?: string): Promise<void> {
    const { owner, repo } = this.config;

    // Add comment with reason
    if (reason) {
      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `Closing PR: ${reason}\n\n*Closed by Seizn Autopilot*`,
      });
    }

    // Close PR
    await this.octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed',
    });
  }

  /**
   * Delete branch after PR is merged/closed
   */
  async deleteBranch(branchName: string): Promise<void> {
    const { owner, repo } = this.config;

    try {
      await this.octokit.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
      });
    } catch {
      // Branch might already be deleted
    }
  }
}

// ============================================
// Patch Generation Utilities
// ============================================

/**
 * Generate unified diff patch from code change
 */
export function generatePatch(
  filePath: string,
  originalContent: string,
  newContent: string
): string {
  const originalLines = originalContent.split('\n');
  const newLines = newContent.split('\n');

  const patch: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  // Simple diff - find changed lines
  const maxLines = Math.max(originalLines.length, newLines.length);
  let hunkStart = -1;
  let hunkLines: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const originalLine = originalLines[i];
    const newLine = newLines[i];

    if (originalLine !== newLine) {
      if (hunkStart === -1) {
        hunkStart = i;
      }

      if (originalLine !== undefined) {
        hunkLines.push(`-${originalLine}`);
      }
      if (newLine !== undefined) {
        hunkLines.push(`+${newLine}`);
      }
    } else if (hunkStart !== -1) {
      // End of hunk
      const hunkHeader = `@@ -${hunkStart + 1},${originalLines.length - hunkStart} +${hunkStart + 1},${newLines.length - hunkStart} @@`;
      patch.push(hunkHeader);
      patch.push(...hunkLines);

      // Add context line
      if (originalLine !== undefined) {
        patch.push(` ${originalLine}`);
      }

      hunkStart = -1;
      hunkLines = [];
    }
  }

  // Handle remaining hunk
  if (hunkStart !== -1) {
    const hunkHeader = `@@ -${hunkStart + 1},${originalLines.length - hunkStart} +${hunkStart + 1},${newLines.length - hunkStart} @@`;
    patch.push(hunkHeader);
    patch.push(...hunkLines);
  }

  return patch.join('\n');
}

/**
 * Apply patch to content
 */
export function applyPatch(originalContent: string, patch: string): string {
  // Simple patch application - for production use a proper diff library
  const lines = originalContent.split('\n');
  const patchLines = patch.split('\n');

  const result: string[] = [];
  let lineIndex = 0;

  for (const patchLine of patchLines) {
    if (patchLine.startsWith('@@')) {
      // Parse hunk header
      const match = patchLine.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        const startLine = parseInt(match[1]) - 1;
        // Add unchanged lines before this hunk
        while (lineIndex < startLine) {
          result.push(lines[lineIndex]);
          lineIndex++;
        }
      }
    } else if (patchLine.startsWith('-')) {
      // Remove line
      lineIndex++;
    } else if (patchLine.startsWith('+')) {
      // Add line
      result.push(patchLine.slice(1));
    } else if (patchLine.startsWith(' ')) {
      // Context line
      result.push(lines[lineIndex]);
      lineIndex++;
    }
  }

  // Add remaining lines
  while (lineIndex < lines.length) {
    result.push(lines[lineIndex]);
    lineIndex++;
  }

  return result.join('\n');
}

// ============================================
// Factory Function
// ============================================

export function createCodeFixer(config: AutopilotConfig, githubToken: string): CodeFixer {
  return new CodeFixer(config, githubToken);
}
