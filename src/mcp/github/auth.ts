import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * GitHub App authentication
 *
 * Handles:
 * - Loading private key from environment or file
 * - Creating JWTs for app authentication
 * - Getting installation access tokens for repositories
 */

interface GitHubAppConfig {
  appId: string;
  privateKey: string;
}

interface InstallationToken {
  token: string;
  expiresAt: Date;
  installationId: number;
}

// GitHub API response types
export interface GitHubUser {
  login: string;
  id: number;
  type: string;
}

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  user: GitHubUser | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  created_at: string;
  updated_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
  labels: GitHubLabel[];
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: GitHubUser | null;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
}

export interface GitHubFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubReview {
  id: number;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  body: string | null;
  user: GitHubUser | null;
  html_url: string;
  submitted_at: string;
}

export interface GitHubMergeResult {
  merged: boolean;
  sha: string;
  message: string;
}

export interface GitHubPermission {
  permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';
}

// Cache installation tokens to avoid unnecessary API calls
const tokenCache = new Map<string, InstallationToken>();

/**
 * Load GitHub App configuration from environment
 */
export function loadAppConfig(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error('GITHUB_APP_ID environment variable not set');
  }

  let privateKey: string | undefined;

  // Try environment variable first (for cloud deployment)
  if (process.env.GITHUB_APP_PRIVATE_KEY) {
    privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  } else if (process.env.GITHUB_APP_PRIVATE_KEY_PATH) {
    // Fall back to file path (for local development)
    const path = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    if (!fs.existsSync(path)) {
      throw new Error(`Private key file not found: ${path}`);
    }
    privateKey = fs.readFileSync(path, 'utf8');
  }

  if (!privateKey) {
    throw new Error(
      'Neither GITHUB_APP_PRIVATE_KEY nor GITHUB_APP_PRIVATE_KEY_PATH is set'
    );
  }

  // Validate private key format
  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('PRIVATE KEY-----')) {
    throw new Error('Invalid private key format - expected PEM format');
  }

  return { appId, privateKey };
}

/**
 * Create a JWT for authenticating as the GitHub App
 *
 * @param config - App configuration
 * @param expirationMinutes - How long the JWT should be valid (max 10 minutes)
 * @returns Signed JWT
 */
export function createAppJWT(config: GitHubAppConfig, expirationMinutes = 10): string {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iat: now - 60, // Issued 60 seconds ago to account for clock drift
    exp: now + (expirationMinutes * 60),
    iss: config.appId,
  };

  // Create JWT header and payload
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsigned = `${header}.${body}`;

  // Sign with private key
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(config.privateKey, 'base64url');

  return `${unsigned}.${signature}`;
}

/**
 * Get an installation access token for a specific repository
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns Installation token
 */
export async function getInstallationToken(
  owner: string,
  repo: string
): Promise<string> {
  const cacheKey = `${owner}/${repo}`;

  // Check cache first
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > new Date(Date.now() + 60000)) {
    // Token is valid for at least another minute
    return cached.token;
  }

  const config = loadAppConfig();
  const jwt = createAppJWT(config);

  // First, get all installations
  const installationsResponse = await fetch(
    'https://api.github.com/app/installations',
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!installationsResponse.ok) {
    const error = await installationsResponse.text();
    throw new Error(`Failed to get installations: ${installationsResponse.status} - ${error}`);
  }

  const installations = await installationsResponse.json() as Array<{
    id: number;
    account: { login: string };
  }>;

  // Find installation for this owner
  const installation = installations.find(
    (i) => i.account.login.toLowerCase() === owner.toLowerCase()
  );

  if (!installation) {
    throw new Error(`GitHub App is not installed for owner: ${owner}`);
  }

  // Get access token for this installation
  const tokenResponse = await fetch(
    `https://api.github.com/app/installations/${installation.id}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        repositories: [repo],
      }),
    }
  );

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to get installation token: ${tokenResponse.status} - ${error}`);
  }

  const tokenData = await tokenResponse.json() as {
    token: string;
    expires_at: string;
  };

  // Cache the token
  const installationToken: InstallationToken = {
    token: tokenData.token,
    expiresAt: new Date(tokenData.expires_at),
    installationId: installation.id,
  };
  tokenCache.set(cacheKey, installationToken);

  return tokenData.token;
}

/**
 * Make an authenticated request to the GitHub API
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param endpoint - API endpoint (e.g., '/pulls/123')
 * @param options - Fetch options
 * @returns Response from GitHub API
 */
export async function githubRequest(
  owner: string,
  repo: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getInstallationToken(owner, repo);

  const url = endpoint.startsWith('https://')
    ? endpoint
    : `https://api.github.com/repos/${owner}/${repo}${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
}

/**
 * Clear the token cache (useful for testing or when tokens are revoked)
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * GitHub API helper functions
 */
export const github = {
  /**
   * Get pull request details
   */
  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    const response = await githubRequest(owner, repo, `/pulls/${prNumber}`);
    if (!response.ok) {
      throw new Error(`Failed to get PR: ${response.status}`);
    }
    return response.json() as Promise<GitHubPullRequest>;
  },

  /**
   * Get issue details
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const response = await githubRequest(owner, repo, `/issues/${issueNumber}`);
    if (!response.ok) {
      throw new Error(`Failed to get issue: ${response.status}`);
    }
    return response.json() as Promise<GitHubIssue>;
  },

  /**
   * List files changed in a pull request
   */
  async listPRFiles(owner: string, repo: string, prNumber: number): Promise<GitHubFile[]> {
    const response = await githubRequest(owner, repo, `/pulls/${prNumber}/files`);
    if (!response.ok) {
      throw new Error(`Failed to list PR files: ${response.status}`);
    }
    return response.json() as Promise<GitHubFile[]>;
  },

  /**
   * Create a comment on an issue or pull request
   */
  async createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
    const response = await githubRequest(owner, repo, `/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create comment: ${response.status}`);
    }
    return response.json() as Promise<GitHubComment>;
  },

  /**
   * Create a review on a pull request
   */
  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body?: string
  ): Promise<GitHubReview> {
    const response = await githubRequest(owner, repo, `/pulls/${prNumber}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ event, body }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create review: ${response.status}`);
    }
    return response.json() as Promise<GitHubReview>;
  },

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    options?: {
      commitTitle?: string;
      commitMessage?: string;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
    }
  ): Promise<GitHubMergeResult> {
    const response = await githubRequest(owner, repo, `/pulls/${prNumber}/merge`, {
      method: 'PUT',
      body: JSON.stringify({
        commit_title: options?.commitTitle,
        commit_message: options?.commitMessage,
        merge_method: options?.mergeMethod || 'squash',
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to merge PR: ${response.status}`);
    }
    return response.json() as Promise<GitHubMergeResult>;
  },

  /**
   * Close an issue or pull request
   */
  async close(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const response = await githubRequest(owner, repo, `/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    if (!response.ok) {
      throw new Error(`Failed to close issue/PR: ${response.status}`);
    }
    return response.json() as Promise<GitHubIssue>;
  },

  /**
   * Create an issue in a repository
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[]
  ): Promise<GitHubIssue> {
    const response = await githubRequest(owner, repo, `/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body, labels }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create issue: ${response.status}`);
    }
    return response.json() as Promise<GitHubIssue>;
  },

  /**
   * Get repository collaborator permission for a user
   */
  async getCollaboratorPermission(owner: string, repo: string, username: string): Promise<GitHubPermission> {
    const response = await githubRequest(
      owner,
      repo,
      `/collaborators/${username}/permission`
    );
    if (!response.ok) {
      if (response.status === 404) {
        return { permission: 'none' };
      }
      throw new Error(`Failed to get permission: ${response.status}`);
    }
    return response.json() as Promise<GitHubPermission>;
  },
};
