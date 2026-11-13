<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Secrets in docs and plans

Never paste a live credential, token, or access code into any file in this
repo, including `.claude/plans/`, `docs/`, and commit messages. The repo is
public. Reference secrets by env var name only (for example
`PARKEAZ_GUEST_CODE`, set in the Convex deployment env). A `gitleaks`
pre-commit hook and CI job enforce this; do not bypass them with `--no-verify`.
