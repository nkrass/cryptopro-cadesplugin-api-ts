# Releasing (GitHub + npm)

This repo is designed to be published to npm.

## Prereqs

- You have access to the GitHub repository.
- You have an npm account with permission to publish the package name.

## Manual Release (local)

1. Ensure `package.json` is not private:
   - Set `"private": false`.
2. Run checks:
   - `npm ci`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
3. Bump version and create a git tag:
   - `npm version patch` (or `minor` / `major`)
   - This creates a tag like `vX.Y.Z`.
4. Push commits + tags:
   - `git push`
   - `git push --tags`
5. Publish:
   - `npm login`
   - `npm publish --access public`

## Automated Release (GitHub Actions)

This repo includes a workflow `.github/workflows/release.yml` that runs on tags `v*.*.*`.

Setup:
- Add `NPM_TOKEN` to GitHub repo secrets.
- Ensure `"private": false` before tagging.

