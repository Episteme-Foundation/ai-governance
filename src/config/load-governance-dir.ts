import * as yaml from 'yaml';
import { RoleDefinition } from '../types';
import { parseRole } from './load-project';
import { getInstallationToken } from '../mcp/github/auth';

/**
 * Result of loading a .governance/ directory from a repo
 */
export interface GovernanceDirContents {
  /** Parsed project.yaml */
  projectYaml: Record<string, unknown>;
  /** Parsed agent role definitions from agents/*.yaml */
  agents: RoleDefinition[];
  /** Content of .governance/PHILOSOPHY.md (if present) */
  philosophy?: string;
  /** Content of .governance/CONSTITUTION.md (if present) */
  constitution?: string;
}

/**
 * Load the .governance/ directory from a GitHub repository via the Contents API
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param installationId - GitHub App installation ID
 * @returns Parsed governance config, or null if .governance/project.yaml is missing
 */
export async function loadGovernanceFromGitHub(
  owner: string,
  repo: string,
  _installationId: number
): Promise<GovernanceDirContents | null> {
  const token = await getInstallationToken(owner, repo);

  // 1. Fetch .governance/project.yaml (required)
  const projectYamlContent = await fetchFileContent(
    owner, repo, '.governance/project.yaml', token
  );

  if (!projectYamlContent) {
    return null; // No .governance/project.yaml means this repo isn't configured
  }

  const projectYaml = yaml.parse(projectYamlContent) as Record<string, unknown>;

  // 2. Fetch agent files from .governance/agents/
  const agents: RoleDefinition[] = [];
  const agentFiles = await listDirectory(owner, repo, '.governance/agents', token);

  for (const filename of agentFiles) {
    if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) continue;

    const agentContent = await fetchFileContent(
      owner, repo, `.governance/agents/${filename}`, token
    );

    if (agentContent) {
      const agentRaw = yaml.parse(agentContent) as Record<string, unknown>;
      agents.push(parseRole(agentRaw));
    }
  }

  // If no agents/ directory, check for roles defined inline in project.yaml
  if (agents.length === 0 && projectYaml.roles) {
    const rawRoles = projectYaml.roles as Array<Record<string, unknown>>;
    for (const rawRole of rawRoles) {
      agents.push(parseRole(rawRole));
    }
  }

  // 3. Fetch optional PHILOSOPHY.md
  const philosophy = await fetchFileContent(
    owner, repo, '.governance/PHILOSOPHY.md', token
  ) ?? undefined;

  // 4. Fetch optional CONSTITUTION.md
  const constitution = await fetchFileContent(
    owner, repo, '.governance/CONSTITUTION.md', token
  ) ?? undefined;

  return {
    projectYaml,
    agents,
    philosophy,
    constitution,
  };
}

/**
 * Fetch a file's decoded content from the GitHub Contents API
 * Returns null if the file doesn't exist (404)
 */
async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token: string
): Promise<string | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${path} from ${owner}/${repo}: ${response.status}`
    );
  }

  const data = await response.json() as {
    content?: string;
    encoding?: string;
    type?: string;
  };

  if (data.type !== 'file' || !data.content || data.encoding !== 'base64') {
    return null;
  }

  return Buffer.from(data.content, 'base64').toString('utf8');
}

/**
 * List filenames in a directory via the GitHub Contents API
 * Returns empty array if the directory doesn't exist
 */
async function listDirectory(
  owner: string,
  repo: string,
  path: string,
  token: string
): Promise<string[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(
      `Failed to list ${path} from ${owner}/${repo}: ${response.status}`
    );
  }

  const data = await response.json() as Array<{ name: string; type: string }>;

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((item) => item.type === 'file')
    .map((item) => item.name);
}
