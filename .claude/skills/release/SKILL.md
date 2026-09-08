# Release Skill

1. Create a release branch from the current `main` branch.
2. Update the version in `package.json` and `package-lock.json`.
3. Move the relevant entries from `[Unreleased]` to a dated version section in `CHANGELOG.md`.
4. Update `README.md` only if the public API changed.
5. Run the validation commands:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
6. Commit the release preparation with `chore(release): prepare rn-typed-assets X.Y.Z`.
7. Push the release branch and merge it through a pull request.
   Do not push the release commit directly to `main`.
8. After the pull request merges, verify that the local `main` branch contains the merge commit.
9. Create the `vX.Y.Z` tag from that merge commit and push only the tag.
   The tag starts the npm publish workflow and the GitHub Release workflow.
