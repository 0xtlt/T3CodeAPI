# Contributing

1. Create a branch named `feat/<topic>`, `fix/<topic>`, or `chore/<topic>`.
2. Make one focused change and add tests.
3. Run `npm run check`.
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/), for example `fix: redact pairing tokens from startup errors`.
5. Open a pull request without changing the package version. Releases update the SemVer version and changelog separately.

Never commit API keys, pairing URLs, `.secrets`, generated archives, or demo recordings.
