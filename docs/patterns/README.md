# Organizational Patterns

This directory contains documentation for organizational patterns that projects can adopt. Patterns are templates for structuring governance—they provide tested solutions to common organizational needs.

## Available Patterns

| Pattern | Summary | Good For |
|---------|---------|----------|
| [Maintainer](maintainer.md) | Single unified authority | Early-stage projects, consistent voice |
| [Council](council.md) | Multiple deliberating agents | Diverse perspectives, high-stakes decisions |
| [Specialized Roles](specialized-roles.md) | Different agents for different inputs | Scale, deep expertise, separation of concerns |
| [Tiered Trust](tiered-trust.md) | Different interfaces at different authority levels | Public interaction, security |

## Choosing a Pattern

No pattern is universally best. Consider:

1. **Project stage**: Early projects benefit from simplicity (Maintainer). Mature projects may need more structure.

2. **Decision stakes**: High-stakes decisions benefit from deliberation (Council). Routine decisions can be handled individually.

3. **Input volume**: High volume requires specialized handling (Specialized Roles). Low volume can be handled uniformly.

4. **Public exposure**: Public-facing projects need security layers (Tiered Trust). Internal projects may not.

5. **Desired voice**: Single voice requires unity (Maintainer). Diverse perspectives require distribution (Council).

## Combining Patterns

Patterns can be combined. Common combinations:

- **Maintainer + Tiered Trust**: Single authority but protected from direct public input
- **Specialized Roles + Tiered Trust**: Different handlers at different trust levels
- **Council + Specialized Roles**: Council deliberates while specialists handle specific domains

## Creating New Patterns

Projects may create patterns not documented here. New patterns should:

1. Be consistent with PHILOSOPHY.md
2. Define clear roles, authorities, and relationships
3. Include checks and balances
4. Document when the pattern is appropriate
5. Be tested in practice before recommendation

If you develop a useful pattern, consider contributing it to this documentation.
