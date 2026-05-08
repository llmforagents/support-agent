# GitHub repository bootstrap (one-time)

This doc describes the manual steps to publish the repo on GitHub for the first time.

## 1. Create the empty repo

- Owner: your-org (or your username)
- Name: support-llm4agents
- Visibility: Public
- DO NOT initialize with README/license (we have ours)

## 2. Push from local

```bash
cd /path/to/support-llm4agents
git remote add origin git@github.com:<your-org>/support-llm4agents.git
git push -u origin main
```

## 3. Enable in repo settings

**General → Features:**
- ✅ Issues
- ✅ Discussions
- ✅ Projects

**Branches → Branch protection rules** (for `main`):
- ✅ Require a pull request before merging
- ✅ Require approvals (1 reviewer)
- ✅ Require status checks to pass: `audit`, `docker-build`
- ✅ Require linear history

**Security → Code security and analysis:**
- ✅ Private vulnerability reporting
- ✅ Dependabot alerts
- ✅ Dependabot security updates
- ✅ Secret scanning + push protection

**Actions → General:**
- Allow GitHub Actions
- Restrict to org-owned actions + Marketplace verified

## 4. Replace placeholders

Search-and-replace these tokens across the repo:

- `<your-org>` → your GitHub org/user
- `<security-email>` → security disclosure email
- `<maintainer-handle>` → your GitHub handle (in `.github/CODEOWNERS`)

Files to update:
- `README.md` (badges, clone URL)
- `.github/SECURITY.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- `CONTRIBUTING.md`
- `docs/operations/*.md`
- `.github/CODEOWNERS`

Commit and push:
```bash
git add -A
git commit -m "docs: replace org/email/handle placeholders for v0.1.0 publication"
git push
```

## 5. First release

After CI is green on main:

```bash
git tag -a v0.1.0 -m "v0.1.0 — Phase 1: chat widget + admin onboarding"
git push origin v0.1.0
```

GitHub UI → Releases → Draft a new release → tag v0.1.0 → auto-generate notes.
