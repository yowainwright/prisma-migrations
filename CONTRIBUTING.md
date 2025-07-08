# Contributing to prisma-migrations

Thanks for your interest in contributing to prisma-migrations! This guide will help you get started.

## Development Setup

1. Fork and clone the repository
2. Install Node.js 24 (recommended via mise or nvm)
3. Enable Corepack: `corepack enable`
4. Install dependencies: `npm install`

## Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Format code: `npm run format`
4. Lint code: `npm run lint`
5. Run tests: `npm test`
6. Run e2e tests: `npm run test:docker`
7. Build project: `npm run build`

## Testing

- Unit tests: `npm test`
- E2E tests: `npm run test:e2e` (requires PostgreSQL)
- Docker tests: `npm run test:docker`

## Code Style

- We use Prettier with default settings
- We use oxlint for linting
- All code must be formatted and linted before committing

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Create a pull request with a clear description
4. Link any related issues

## Issue Reporting

When reporting issues, please include:
- Node.js version
- npm version
- Operating system
- Minimal reproduction case
- Error messages and stack traces

## Questions?

Feel free to open an issue for questions or join discussions in existing issues.
