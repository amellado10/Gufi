@AGENTS.md

# Güfi OS — Claude Code instructions

The shared `AGENTS.md` is the canonical product and engineering specification for Claude Code and Codex. Read `README.md` for onboarding, architecture, setup and the implementation sequence. Do not duplicate or silently change the shared requirements.

## Working in this repository

- On the first session, audit the actual repository, dependencies, migrations, authorization, tests, Supabase and Vercel configuration. Report gaps and propose Phase 1 before editing. Inspect environment variable names only; never reveal values.
- Preserve existing work and conventions. Use the actual lockfile and scripts; do not assume the proposed stack is already installed.
- Verify Güfi's brand from https://www.gufi.io/ or original assets. Do not invent official logos, fonts or colors.
- Use plan mode for initial implementation planning and for changes involving authentication, RLS, financial records, data migrations, external integrations or production infrastructure. Obtain explicit approval for consequential actions.
- Implement focused vertical slices, test authorization and error states, and report actual verification results. Do not fabricate data, connection status or test results.
- Never deploy to production, apply production migrations, reset databases, force push, expose credentials, move money or change external accounts without explicit authorization.
- Claude Code is a development tool; the application's AI model provider is a separate architectural decision. Preserve any approved provider integration.
- Update the shared requirements and repository documentation when the team approves a changed decision. Do not overwrite existing user changes or competing instructions without reconciling them.

Initial goal: propose and then build the authenticated, branded workspace foundation, with secure organization access, shared navigation, dashboard and a minimal real client/project workflow. Consult `AGENTS.md` for complete acceptance criteria.
