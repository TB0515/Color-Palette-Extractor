# Claude Code Instructions

## Task Workflow (follow this for every task, no exceptions)

1. **Check permissions** — read `permissions.md` to confirm all required file and tool access before starting
2. **New branch** — run `git pull origin main` to get the latest, then create a dedicated git branch; use the naming convention `fix/<short-description>` (e.g. `fix/ssrf`, `fix/input-validation`)
3. **Plan mode first** — enter plan mode, present the full approach, and wait for explicit confirmation before writing any code
4. **Implement** — once confirmed, execute the full plan in one pass without asking for permission mid-way; request any required file access upfront
5. **Test** — run the test suite and verify manually; if tests fail, attempt to fix within the scope of the current task and re-run; if the failure is unrelated to the task or cannot be resolved confidently, stop and report to the user before proceeding
6. **Lint** — run `npm run lint` to auto-format; re-stage any files modified by the formatter before moving on
7. **Security check before commit** — run `git diff --staged` and scan all staged changes for sensitive data (API keys, tokens, passwords, `.env` contents, hardcoded secrets); if any found, remove and fix before proceeding
8. **Commit and push** — single clean one-line commit message, no co-authored line; push the branch, open a PR into main, squash merge it, delete both the local and remote branch; if the merge fails (CI failure, conflict), stop and report to the user before retrying

9. **Done** — only move to the next task after all steps above are complete

Never skip the plan-then-confirm step. If a required file or command is not listed in `permissions.md`, stop and ask the user before proceeding and add it to permission.md for future references.

When given multiple tasks at once: plan each one independently, present all plans, get confirmation for all, then implement them one after the other without interruption. Each task still gets its own branch, security check, commit, and push before the next begins.

## Auto-approved commands

The following commands may be run without prompting for permission. Run each command separately — compound commands (`&&`, `||`, `;`, pipes) require approval and should be avoided; split them into individual calls instead.

- `git status`, `git diff`, `git log`, `git add`, `git commit`, `git push`, `git pull`, `git checkout`, `git branch`, `git merge`, `git rebase`
- `npm test`, `npm run lint`, `npm start`, `npm install`
- `gh pr create`, `gh pr merge`, `gh pr view`, `gh branch delete`
- Read/Write/Edit on any file in this project directory


