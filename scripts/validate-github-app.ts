#!/usr/bin/env npx ts-node
/**
 * Validates GitHub App configuration
 *
 * Checks:
 * - Environment variables are set
 * - Private key is valid
 * - App can authenticate
 * - App has required permissions
 * - App is installed on target repository
 *
 * Usage: npm run validate:github
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as crypto from 'crypto';

interface ValidationResult {
  check: string;
  passed: boolean;
  message: string;
}

const results: ValidationResult[] = [];

function check(name: string, passed: boolean, message: string) {
  results.push({ check: name, passed, message });
  const icon = passed ? '✓' : '✗';
  console.log(`${icon} ${name}: ${message}`);
}

async function main() {
  console.log('Validating GitHub App configuration...\n');

  // Check environment variables
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  const privateKeyEnv = process.env.GITHUB_APP_PRIVATE_KEY;
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const repository = process.env.GITHUB_REPOSITORY;

  check(
    'GITHUB_APP_ID',
    !!appId,
    appId ? `Set to ${appId}` : 'Not set'
  );

  check(
    'GITHUB_WEBHOOK_SECRET',
    !!webhookSecret,
    webhookSecret ? 'Set (hidden)' : 'Not set'
  );

  check(
    'GITHUB_REPOSITORY',
    !!repository,
    repository ? `Set to ${repository}` : 'Not set'
  );

  // Check private key
  let privateKey: string | null = null;

  if (privateKeyEnv) {
    privateKey = privateKeyEnv;
    check(
      'GITHUB_APP_PRIVATE_KEY',
      true,
      'Set via environment variable'
    );
  } else if (privateKeyPath) {
    if (fs.existsSync(privateKeyPath)) {
      privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      check(
        'GITHUB_APP_PRIVATE_KEY_PATH',
        true,
        `File exists at ${privateKeyPath}`
      );
    } else {
      check(
        'GITHUB_APP_PRIVATE_KEY_PATH',
        false,
        `File not found: ${privateKeyPath}`
      );
    }
  } else {
    check(
      'Private Key',
      false,
      'Neither GITHUB_APP_PRIVATE_KEY nor GITHUB_APP_PRIVATE_KEY_PATH is set'
    );
  }

  // Validate private key format
  if (privateKey) {
    const isValidFormat =
      privateKey.includes('-----BEGIN') &&
      privateKey.includes('PRIVATE KEY-----');
    check(
      'Private Key Format',
      isValidFormat,
      isValidFormat ? 'Valid PEM format' : 'Invalid format - should be PEM'
    );

    if (isValidFormat) {
      // Try to create a JWT to verify the key works
      try {
        const now = Math.floor(Date.now() / 1000);
        const payload = {
          iat: now - 60,
          exp: now + 600,
          iss: appId,
        };

        // Create JWT header and payload
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
        const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const unsigned = `${header}.${body}`;

        // Sign with private key
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(unsigned);
        const signature = sign.sign(privateKey, 'base64url');

        const jwt = `${unsigned}.${signature}`;

        check(
          'JWT Generation',
          true,
          'Successfully generated JWT from private key'
        );

        // Try to authenticate with GitHub
        console.log('\nAttempting GitHub API authentication...');

        const response = await fetch('https://api.github.com/app', {
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });

        if (response.ok) {
          const app = await response.json();
          check(
            'GitHub Authentication',
            true,
            `Authenticated as "${app.name}" (ID: ${app.id})`
          );

          // Check permissions
          const permissions = app.permissions || {};
          const requiredPerms = {
            contents: 'read',
            issues: 'write',
            pull_requests: 'write',
          };

          let allPermsOk = true;
          for (const [perm, level] of Object.entries(requiredPerms)) {
            const hasPerm = permissions[perm] === level || permissions[perm] === 'write';
            if (!hasPerm) {
              allPermsOk = false;
              check(
                `Permission: ${perm}`,
                false,
                `Missing or insufficient - needs ${level}`
              );
            }
          }

          if (allPermsOk) {
            check(
              'Required Permissions',
              true,
              'All required permissions are configured'
            );
          }

          // Check installation on target repository
          if (repository) {
            console.log(`\nChecking installation on ${repository}...`);

            const installsResponse = await fetch('https://api.github.com/app/installations', {
              headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
            });

            if (installsResponse.ok) {
              const installations = await installsResponse.json();

              // Get installation access tokens and check repo access
              let foundRepo = false;
              for (const install of installations) {
                // Get installation token
                const tokenResponse = await fetch(
                  `https://api.github.com/app/installations/${install.id}/access_tokens`,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${jwt}`,
                      Accept: 'application/vnd.github+json',
                      'X-GitHub-Api-Version': '2022-11-28',
                    },
                  }
                );

                if (tokenResponse.ok) {
                  const { token } = await tokenResponse.json();

                  // Check if we can access the target repo
                  const repoResponse = await fetch(
                    `https://api.github.com/repos/${repository}`,
                    {
                      headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28',
                      },
                    }
                  );

                  if (repoResponse.ok) {
                    foundRepo = true;
                    check(
                      'Repository Access',
                      true,
                      `App is installed and has access to ${repository}`
                    );
                    break;
                  }
                }
              }

              if (!foundRepo) {
                check(
                  'Repository Access',
                  false,
                  `App is not installed on ${repository} or lacks access`
                );
              }
            }
          }
        } else {
          const error = await response.text();
          check(
            'GitHub Authentication',
            false,
            `Failed: ${response.status} - ${error}`
          );
        }
      } catch (err) {
        check(
          'JWT Generation',
          false,
          `Failed to sign JWT: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;

  if (allPassed) {
    console.log(`\n✓ All ${total} checks passed! GitHub App is configured correctly.`);
  } else {
    console.log(`\n✗ ${passed}/${total} checks passed. Please fix the issues above.`);
    console.log('\nSee docs/setup-github-app.md for setup instructions.');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
