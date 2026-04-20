# Copilot Instructions for This Repository

## General Guidelines

- Always question what I ask for. If something seems off, ask for clarification.
- Suggest different approaches or solutions if you think they might be better or more modern than what I asked for.
- When writing code, follow best practices and modern conventions. Don't just do the minimum to get it working.
- Add comments to explain the code, especially if it's complex or non-obvious.

## Commit Messages

- Always use [Conventional Commits](https://www.conventionalcommits.org/) format.
- Format: `type(scope): description`
- Use imperative mood (e.g., "fix bug", not "fixed bug").
- Follow the rules configured in commitlint.config.js
- Include scope when relevant (e.g., api, ui, auth).
- Optionally add a body with details and reference issues with `#<number>` when applicable.

## Markdown Files

- Ensure proper heading hierarchy (e.g., H1 followed by H2, then H3).
- Use fenced code blocks with language identifiers for code snippets.

## Component & Modular Standards

- **Atomic Design:** Follow an Atomic Design-inspired hierarchy (Atoms -> Molecules -> Organisms -> Templates).
- **Hooks over HOCs:** Prefer Custom Hooks for sharing stateful logic between components.
- **Strict Boundaries:** Components should not reach into the internals of other components. Use a clear public API via props.
- **Tree-Shaking:** Write modular code that is tree-shakeable. Prefer named exports over default exports to improve IDE tooling and bundle size.
