# Release Skill

1. Bump version in package.json
2. Update CHANGELOG.md with conventional commit summary
3. Update README if API changed
4. Run typecheck + lint + tests
5. Commit with `chore(release): 🔖 vX.Y.Z`
6. Create git tag and push tag + branch SEPARATELY (never to main directly)
