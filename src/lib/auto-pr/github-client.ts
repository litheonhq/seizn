/**
 * Seizn Auto-PR Fixer - GitHub Client
 *
 * Handles GitHub API interactions for PR creation and management.
 * Uses GitHub App authentication for secure access.
 */

import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { randomUUID } from 'crypto';
import type {
  GitHubRepo,
  PRConfig,
  PRFile,
  CreatePRRequest,
  PRRecord,
  PRStatus,
  PRStatusEvent,
  PRMetadata,
  FixSuggestion,
} from './types';

// ============================================
// GitHub Client Configuration
// ============================================

export interface GitHubClientConfig {
  /** GitHub App ID */
  appId: string;
  /** Private key (PEM format) */
  privateKey: string;
  /** Installation ID for the repository */
  installationId: number;
}

// ============================================
// GitHub Client Class
// ============================================

export class GitHubPRClient {
  private octokit: Octokit | null = null;
  private config: GitHubClientConfig;
  private authenticated = false;

  constructor(config: GitHubClientConfig) {
    this.config = config;
  }

  /**
   * Initialize the client with authentication
   */
  async initialize(): Promise<void> {
    if (this.authenticated && this.octokit) return;

    try {
      const auth = createAppAuth({
        appId: this.config.appId,
        privateKey: this.config.privateKey,
        installationId: this.config.installationId,
      });

      // Get installation access token
      const { token } = await auth({ type: 'installation' });

      this.octokit = new Octokit({
        auth: token,
      });

      this.authenticated = true;
    } catch (error) {
      console.error('GitHub authentication failed:', error);
      throw new Error('Failed to authenticate with GitHub');
    }
  }

  /**
   * Ensure client is authenticated
   */
  private async ensureAuthenticated(): Promise<Octokit> {
    if (!this.authenticated || !this.octokit) {
      await this.initialize();
    }
    if (!this.octokit) {
      throw new Error('GitHub client not initialized');
    }
    return this.octokit;
  }

  /**
   * Create a new branch
   */
  async createBranch(
    repo: GitHubRepo,
    branchName: string,
    baseBranch: string
  ): Promise<string> {
    const octokit = await this.ensureAuthenticated();

    // Get the SHA of the base branch
    const { data: baseRef } = await octokit.git.getRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${baseBranch}`,
    });

    // Create new branch
    await octokit.git.createRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha,
    });

    return branchName;
  }

  /**
   * Check if branch exists
   */
  async branchExists(repo: GitHubRepo, branchName: string): Promise<boolean> {
    const octokit = await this.ensureAuthenticated();

    try {
      await octokit.git.getRef({
        owner: repo.owner,
        repo: repo.name,
        ref: `heads/${branchName}`,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(repo: GitHubRepo, branchName: string): Promise<void> {
    const octokit = await this.ensureAuthenticated();

    await octokit.git.deleteRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${branchName}`,
    });
  }

  /**
   * Create or update a file in the repository
   */
  async createOrUpdateFile(
    repo: GitHubRepo,
    branchName: string,
    file: PRFile,
    commitMessage: string
  ): Promise<void> {
    const octokit = await this.ensureAuthenticated();

    // Check if file exists
    let sha: string | undefined;
    try {
      const { data: existingFile } = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path: file.path,
        ref: branchName,
      });

      if ('sha' in existingFile) {
        sha = existingFile.sha;
      }
    } catch {
      // File doesn't exist
    }

    if (file.action === 'delete') {
      if (sha) {
        await octokit.repos.deleteFile({
          owner: repo.owner,
          repo: repo.name,
          path: file.path,
          message: commitMessage,
          sha,
          branch: branchName,
        });
      }
    } else {
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: file.path,
        message: commitMessage,
        content: Buffer.from(file.content).toString('base64'),
        branch: branchName,
        sha,
      });
    }
  }

  /**
   * Create a commit with multiple file changes
   */
  async createCommit(
    repo: GitHubRepo,
    branchName: string,
    files: PRFile[],
    commitMessage: string
  ): Promise<string> {
    const octokit = await this.ensureAuthenticated();

    // Get the current commit SHA
    const { data: ref } = await octokit.git.getRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${branchName}`,
    });
    const currentCommitSha = ref.object.sha;

    // Get the tree SHA
    const { data: commit } = await octokit.git.getCommit({
      owner: repo.owner,
      repo: repo.name,
      commit_sha: currentCommitSha,
    });
    const baseTreeSha = commit.tree.sha;

    // Create blobs for each file
    const treeItems = await Promise.all(
      files
        .filter(f => f.action !== 'delete')
        .map(async (file) => {
          const { data: blob } = await octokit.git.createBlob({
            owner: repo.owner,
            repo: repo.name,
            content: Buffer.from(file.content).toString('base64'),
            encoding: 'base64',
          });

          return {
            path: file.path,
            mode: file.mode as '100644' | '100755' | '040000' | '160000' | '120000',
            type: 'blob' as const,
            sha: blob.sha,
          };
        })
    );

    // Add delete markers for deleted files
    const deleteItems = files
      .filter(f => f.action === 'delete')
      .map(file => ({
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: null as unknown as string, // null SHA deletes the file
      }));

    // Create new tree
    const { data: newTree } = await octokit.git.createTree({
      owner: repo.owner,
      repo: repo.name,
      base_tree: baseTreeSha,
      tree: [...treeItems, ...deleteItems],
    });

    // Create commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner: repo.owner,
      repo: repo.name,
      message: commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha],
    });

    // Update branch reference
    await octokit.git.updateRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${branchName}`,
      sha: newCommit.sha,
    });

    return newCommit.sha;
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    repo: GitHubRepo,
    request: CreatePRRequest
  ): Promise<PRRecord> {
    const octokit = await this.ensureAuthenticated();
    const now = new Date().toISOString();

    const prRecord: PRRecord = {
      id: `pr-${randomUUID().slice(0, 8)}`,
      userId: request.metadata.userId,
      status: 'creating',
      request,
      history: [{
        status: 'creating',
        timestamp: now,
        actor: 'auto-pr',
        message: 'Creating pull request',
      }],
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Create branch
      const branchName = request.headBranch;
      const branchExists = await this.branchExists(repo, branchName);

      if (!branchExists) {
        await this.createBranch(repo, branchName, request.baseBranch);
      }

      // Create commit with all files
      if (request.files.length > 0) {
        await this.createCommit(
          repo,
          branchName,
          request.files,
          request.commitMessage
        );
      }

      // Create the PR
      const { data: pr } = await octokit.pulls.create({
        owner: repo.owner,
        repo: repo.name,
        title: request.title,
        body: request.body,
        head: branchName,
        base: request.baseBranch,
        draft: request.draft,
      });

      prRecord.prNumber = pr.number;
      prRecord.prUrl = pr.html_url;
      prRecord.status = 'created';
      prRecord.githubResponse = pr as unknown as Record<string, unknown>;

      prRecord.history.push({
        status: 'created',
        timestamp: new Date().toISOString(),
        actor: 'auto-pr',
        message: `PR #${pr.number} created`,
      });

      // Add reviewers if specified
      if (request.reviewers && request.reviewers.length > 0) {
        try {
          await octokit.pulls.requestReviewers({
            owner: repo.owner,
            repo: repo.name,
            pull_number: pr.number,
            reviewers: request.reviewers,
          });

          prRecord.status = 'review_requested';
          prRecord.history.push({
            status: 'review_requested',
            timestamp: new Date().toISOString(),
            actor: 'auto-pr',
            message: `Requested review from: ${request.reviewers.join(', ')}`,
          });
        } catch (error) {
          console.warn('Failed to request reviewers:', error);
        }
      }

      // Add labels if specified
      if (request.labels && request.labels.length > 0) {
        try {
          await octokit.issues.addLabels({
            owner: repo.owner,
            repo: repo.name,
            issue_number: pr.number,
            labels: request.labels,
          });
        } catch (error) {
          console.warn('Failed to add labels:', error);
        }
      }
    } catch (error) {
      prRecord.status = 'failed';
      prRecord.error = error instanceof Error ? error.message : 'Unknown error';
      prRecord.history.push({
        status: 'failed',
        timestamp: new Date().toISOString(),
        actor: 'auto-pr',
        message: prRecord.error,
      });
    }

    prRecord.updatedAt = new Date().toISOString();
    return prRecord;
  }

  /**
   * Get PR status
   */
  async getPRStatus(
    repo: GitHubRepo,
    prNumber: number
  ): Promise<{ status: PRStatus; checks?: PRRecord['checks'] }> {
    const octokit = await this.ensureAuthenticated();

    const { data: pr } = await octokit.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
    });

    // Map GitHub state to our status
    let status: PRStatus = 'created';
    if (pr.merged) {
      status = 'merged';
    } else if (pr.state === 'closed') {
      status = 'closed';
    } else if (pr.draft) {
      status = 'created';
    }

    // Get check runs
    const { data: checkSuites } = await octokit.checks.listSuitesForRef({
      owner: repo.owner,
      repo: repo.name,
      ref: pr.head.sha,
    });

    const checks: PRRecord['checks'] = {
      status: 'pending',
      runs: [],
    };

    for (const suite of checkSuites.check_suites) {
      if (suite.status === 'completed') {
        if (suite.conclusion === 'success') {
          checks.status = 'success';
        } else if (suite.conclusion === 'failure') {
          checks.status = 'failure';
        }
      }

      // Get check runs for this suite
      const { data: runs } = await octokit.checks.listForSuite({
        owner: repo.owner,
        repo: repo.name,
        check_suite_id: suite.id,
      });

      for (const run of runs.check_runs) {
        checks.runs.push({
          name: run.name,
          status: run.status,
          conclusion: run.conclusion ?? undefined,
        });
      }
    }

    return { status, checks };
  }

  /**
   * Update PR (add comment, update body, etc.)
   */
  async updatePR(
    repo: GitHubRepo,
    prNumber: number,
    update: { title?: string; body?: string }
  ): Promise<void> {
    const octokit = await this.ensureAuthenticated();

    await octokit.pulls.update({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      ...update,
    });
  }

  /**
   * Add comment to PR
   */
  async addComment(
    repo: GitHubRepo,
    prNumber: number,
    body: string
  ): Promise<void> {
    const octokit = await this.ensureAuthenticated();

    await octokit.issues.createComment({
      owner: repo.owner,
      repo: repo.name,
      issue_number: prNumber,
      body,
    });
  }

  /**
   * Merge PR
   */
  async mergePR(
    repo: GitHubRepo,
    prNumber: number,
    options?: {
      mergeMethod?: 'merge' | 'squash' | 'rebase';
      commitTitle?: string;
      commitMessage?: string;
    }
  ): Promise<boolean> {
    const octokit = await this.ensureAuthenticated();

    try {
      await octokit.pulls.merge({
        owner: repo.owner,
        repo: repo.name,
        pull_number: prNumber,
        merge_method: options?.mergeMethod || 'squash',
        commit_title: options?.commitTitle,
        commit_message: options?.commitMessage,
      });
      return true;
    } catch (error) {
      console.error('Failed to merge PR:', error);
      return false;
    }
  }

  /**
   * Close PR without merging
   */
  async closePR(repo: GitHubRepo, prNumber: number): Promise<void> {
    const octokit = await this.ensureAuthenticated();

    await octokit.pulls.update({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      state: 'closed',
    });
  }

  /**
   * Enable auto-merge for PR
   */
  async enableAutoMerge(
    repo: GitHubRepo,
    prNumber: number
  ): Promise<boolean> {
    const octokit = await this.ensureAuthenticated();

    try {
      // Get PR node ID
      const { data: pr } = await octokit.pulls.get({
        owner: repo.owner,
        repo: repo.name,
        pull_number: prNumber,
      });

      // Use GraphQL to enable auto-merge
      await octokit.graphql(`
        mutation EnableAutoMerge($pullRequestId: ID!) {
          enablePullRequestAutoMerge(input: {
            pullRequestId: $pullRequestId,
            mergeMethod: SQUASH
          }) {
            pullRequest {
              autoMergeRequest {
                enabledAt
              }
            }
          }
        }
      `, {
        pullRequestId: pr.node_id,
      });

      return true;
    } catch (error) {
      console.error('Failed to enable auto-merge:', error);
      return false;
    }
  }

  /**
   * Get repository information
   */
  async getRepository(owner: string, name: string): Promise<GitHubRepo | null> {
    const octokit = await this.ensureAuthenticated();

    try {
      const { data: repo } = await octokit.repos.get({
        owner,
        repo: name,
      });

      return {
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
      };
    } catch {
      return null;
    }
  }

  /**
   * List open PRs created by the app
   */
  async listOpenPRs(repo: GitHubRepo): Promise<Array<{
    number: number;
    title: string;
    url: string;
    createdAt: string;
  }>> {
    const octokit = await this.ensureAuthenticated();

    const { data: prs } = await octokit.pulls.list({
      owner: repo.owner,
      repo: repo.name,
      state: 'open',
      sort: 'created',
      direction: 'desc',
    });

    // Filter to only PRs created by this app
    // (In a real implementation, you'd check the author is the app's bot user)
    return prs.map(pr => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      createdAt: pr.created_at,
    }));
  }
}

// ============================================
// Factory Functions
// ============================================

let clientInstance: GitHubPRClient | null = null;

export function getGitHubClient(config?: GitHubClientConfig): GitHubPRClient {
  if (!clientInstance && config) {
    clientInstance = new GitHubPRClient(config);
  }
  if (!clientInstance) {
    throw new Error('GitHub client not initialized. Provide config on first call.');
  }
  return clientInstance;
}

export function createGitHubClient(config: GitHubClientConfig): GitHubPRClient {
  return new GitHubPRClient(config);
}

/**
 * Create GitHub client from environment variables
 */
export function createGitHubClientFromEnv(): GitHubPRClient | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    console.warn('GitHub App credentials not found in environment');
    return null;
  }

  return new GitHubPRClient({
    appId,
    privateKey,
    installationId: parseInt(installationId, 10),
  });
}
