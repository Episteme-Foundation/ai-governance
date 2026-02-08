import { validateProjectYaml, validateAgentYaml } from './validate-config';

describe('validateProjectYaml', () => {
  it('should pass for a valid project config', () => {
    const result = validateProjectYaml({
      project: {
        id: 'test-project',
        name: 'Test Project',
        repository: 'https://github.com/org/repo',
      },
      trust: {
        github_roles: {
          public: 'anonymous',
          collaborator: 'contributor',
        },
      },
      limits: {
        anonymous: { requests_per_hour: 10 },
        contributor: { requests_per_hour: 100 },
        authorized: { requests_per_hour: 0 },
      },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when project section is missing', () => {
    const result = validateProjectYaml({});

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'project' }),
      ])
    );
  });

  it('should fail when project.id is missing', () => {
    const result = validateProjectYaml({
      project: {
        name: 'Test',
        repository: 'https://github.com/org/repo',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'project.id' }),
      ])
    );
  });

  it('should fail for invalid trust levels', () => {
    const result = validateProjectYaml({
      project: {
        id: 'test',
        name: 'Test',
        repository: 'https://github.com/org/repo',
      },
      trust: {
        github_roles: {
          public: 'invalid_level',
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'trust.github_roles.public',
          message: expect.stringContaining('invalid_level'),
        }),
      ])
    );
  });

  it('should pass with minimal required fields', () => {
    const result = validateProjectYaml({
      project: {
        id: 'minimal',
        name: 'Minimal',
        repository: 'https://github.com/org/repo',
      },
    });

    expect(result.valid).toBe(true);
  });
});

describe('validateAgentYaml', () => {
  it('should pass for a valid agent config', () => {
    const result = validateAgentYaml(
      {
        name: 'reception',
        purpose: 'Handle public input',
        accepts_trust: ['anonymous', 'contributor'],
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
      },
      'reception.yaml'
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when name is missing', () => {
    const result = validateAgentYaml(
      {
        purpose: 'Handle input',
        accepts_trust: ['anonymous'],
      },
      'agent.yaml'
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'agent.yaml.name' }),
      ])
    );
  });

  it('should fail when accepts_trust is empty', () => {
    const result = validateAgentYaml(
      {
        name: 'test',
        purpose: 'Test',
        accepts_trust: [],
      },
      'test.yaml'
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'test.yaml.accepts_trust' }),
      ])
    );
  });

  it('should fail when model is not a string', () => {
    const result = validateAgentYaml(
      {
        name: 'test',
        purpose: 'Test',
        accepts_trust: ['anonymous'],
        model: 123,
      },
      'test.yaml'
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'test.yaml.model' }),
      ])
    );
  });

  it('should pass without optional model and max_tokens', () => {
    const result = validateAgentYaml(
      {
        name: 'reception',
        purpose: 'Handle public input',
        accepts_trust: ['anonymous'],
      },
      'reception.yaml'
    );

    expect(result.valid).toBe(true);
  });
});
