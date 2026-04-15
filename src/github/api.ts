import type {
  GitHubPR,
  GitHubCommit,
  GitHubComment,
  GitHubCheckRun,
  GitHubCommitStatus,
  GitHubCustomProperty,
} from './types';

const GITHUB_API = 'https://api.github.com';

export interface GitHubClient {
  getPR(owner: string, repo: string, prNumber: number): Promise<GitHubPR | null>;
  getPRCommits(owner: string, repo: string, prNumber: number): Promise<GitHubCommit[]>;
  getPRComments(owner: string, repo: string, prNumber: number): Promise<GitHubComment[]>;
  createComment(owner: string, repo: string, prNumber: number, body: string): Promise<GitHubComment>;
  updateComment(owner: string, repo: string, commentId: number, body: string): Promise<void>;
  getCheckRuns(owner: string, repo: string, ref: string): Promise<GitHubCheckRun[]>;
  getCommitStatuses(owner: string, repo: string, ref: string): Promise<GitHubCommitStatus[]>;
  mergePR(owner: string, repo: string, prNumber: number, method: string, sha: string): Promise<boolean>;
  getRepoCustomProperties(owner: string, repo: string): Promise<GitHubCustomProperty[]>;
  getFileContent(owner: string, repo: string, path: string): Promise<string | null>;
  getAppLogin(): Promise<string>;
}

export function createGitHubClient(token: string): GitHubClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Mushin-App/1.0',
    'Content-Type': 'application/json',
  };

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const resp = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`GitHub API ${method} ${path} → ${resp.status}: ${text}`);
    }

    if (resp.status === 204) return undefined as T;
    return resp.json() as Promise<T>;
  }

  return {
    async getPR(owner, repo, prNumber) {
      try {
        return await request<GitHubPR>('GET', `/repos/${owner}/${repo}/pulls/${prNumber}`);
      } catch {
        return null;
      }
    },

    async getPRCommits(owner, repo, prNumber) {
      return request<GitHubCommit[]>('GET', `/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=1`);
    },

    async getPRComments(owner, repo, prNumber) {
      return request<GitHubComment[]>('GET', `/repos/${owner}/${repo}/issues/${prNumber}/comments`);
    },

    async createComment(owner, repo, prNumber, body) {
      return request<GitHubComment>('POST', `/repos/${owner}/${repo}/issues/${prNumber}/comments`, { body });
    },

    async updateComment(owner, repo, commentId, body) {
      await request<void>('PATCH', `/repos/${owner}/${repo}/issues/comments/${commentId}`, { body });
    },

    async getCheckRuns(owner, repo, ref) {
      const data = await request<{ check_runs: GitHubCheckRun[] }>(
        'GET',
        `/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`,
      );
      return data.check_runs;
    },

    async getCommitStatuses(owner, repo, ref) {
      return request<GitHubCommitStatus[]>(
        'GET',
        `/repos/${owner}/${repo}/commits/${ref}/statuses?per_page=100`,
      );
    },

    async mergePR(owner, repo, prNumber, method, sha) {
      try {
        await request<void>('PUT', `/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
          merge_method: method,
          sha,
        });
        return true;
      } catch (err) {
        console.error(`Merge failed for ${owner}/${repo}#${prNumber}:`, err);
        return false;
      }
    },

    async getRepoCustomProperties(owner, repo) {
      try {
        return await request<GitHubCustomProperty[]>(
          'GET',
          `/repos/${owner}/${repo}/properties/values`,
        );
      } catch {
        return [];
      }
    },

    async getFileContent(owner, repo, path) {
      try {
        const data = await request<{ content: string; encoding: string }>(
          'GET',
          `/repos/${owner}/${repo}/contents/${path}`,
        );
        if (data.encoding === 'base64') {
          return atob(data.content.replace(/\n/g, ''));
        }
        return data.content;
      } catch {
        return null;
      }
    },

    async getAppLogin() {
      try {
        const data = await request<{ slug: string }>('GET', '/app');
        return `${data.slug}[bot]`;
      } catch {
        return 'mushin[bot]';
      }
    },
  };
}
