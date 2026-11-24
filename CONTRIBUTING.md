# Contributing

Ametherian is currently gathering feedback on its direction and proposed architecture.

## Before contributing

- Read the project status and security approach.
- Keep proposals focused and explain the developer problem they address.
- Distinguish existing behavior from proposed behavior.
- Include runtime and compatibility considerations.
- For security-related proposals, include the threat, trust boundary, mitigation, and a testable acceptance criterion.

## Proposed contribution standards

Future implementation repositories should use:

- TypeScript strict mode where TypeScript is used
- Consistent formatting and linting
- Unit, integration, compatibility, and security regression tests
- Documented public APIs and deprecation policy
- Dependency review and reproducible lockfiles
- Small, reviewable pull requests
- Changelogs for user-visible changes

## Pull request expectations

A pull request should explain why the change is needed, what changed, how it was tested, what compatibility effects it has, and whether documentation is updated. Do not include secrets, private vulnerability details, generated credentials, or unrelated formatting churn.