# SDK Release

Agent Breach Replay ships two SDKs:

- TypeScript: `@agent-breach/replay`
- Python: `agent-breach-replay`

The shared TypeScript schema package is:

- `@agent-breach/trace-schema`

## Validate

```bash
npm run validate:sdk
python3 -m build packages/trace-sdk-py
```

## Publish TypeScript Packages

Log in to npm:

```bash
npm login
```

Publish the schema first:

```bash
npm publish --workspace @agent-breach/trace-schema --access public
```

Then publish the SDK:

```bash
npm publish --workspace @agent-breach/replay --access public
```

## Publish Python Package

Install publishing tools:

```bash
python3 -m pip install --upgrade build twine
```

Build:

```bash
python3 -m build packages/trace-sdk-py
```

Upload to TestPyPI first:

```bash
python3 -m twine upload --repository testpypi packages/trace-sdk-py/dist/*
```

Upload to PyPI when ready:

```bash
python3 -m twine upload packages/trace-sdk-py/dist/*
```

## Release Checklist

- Version numbers match.
- README examples use the deployed app URL.
- Package names are available.
- npm and PyPI accounts have publishing permissions.
- No secrets are included in package files.

