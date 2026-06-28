# Code Quality Tools

SpikeFit uses two code quality services connected to GitHub: **Codacy** and **SonarCloud**. Both run automatically on every push and pull request. This document explains the GitHub integration and how to query findings via their REST APIs.

No Node.js, npm, or Docker is required.

### Required: API tokens in `~/.zshrc`

Both tools require an API token. Add them once to `~/.zshrc` so they persist across sessions:

```bash
export CODACY_API_TOKEN=your_codacy_token   # app.codacy.com → Account → Access Management → API tokens
export SONAR_TOKEN=your_sonarcloud_token    # sonarcloud.io → My Account → Security → Generate Tokens
```

All API commands below assume `source ~/.zshrc` has been run in the current shell session. Claude's shell does not inherit your terminal's environment — always run `source ~/.zshrc` before any API call.

---

## GitHub Integration (Automatic)

When you push a commit or open a pull request:

- **Codacy** runs its engine suite (ESLint for JS, Pylint for Python, CSSLint for CSS) and posts a status check and inline comments on the PR. Configuration in `.codacy.yml`.
- **SonarCloud** runs its scanner and posts a Quality Gate status check on the PR. Configuration in `sonar-project.properties`.

Both services ignore the paths listed in their config files (`tests/unit/qunit/`, `fonts/`, `img/`).

---

## Querying Codacy Findings via API

**Issues for a specific file (fastest — use for the file you just edited):**

```bash
source ~/.zshrc

# Step 1: get the fileId for the file you care about
FILE="js/app.js"
FILE_ID=$(curl -s -H "api-token: $CODACY_API_TOKEN" \
  "https://app.codacy.com/api/v3/organizations/gh/jfrappier/repositories/spikefit/files?limit=100" \
  | python3 -c "import sys,json; files=json.load(sys.stdin)['data']; print(next((f['fileId'] for f in files if f['path']=='$FILE'), 'not found'))")

# Step 2: fetch its issues
curl -s -H "api-token: $CODACY_API_TOKEN" \
  "https://app.codacy.com/api/v3/organizations/gh/jfrappier/repositories/spikefit/files/$FILE_ID/issues" \
  | python3 -m json.tool
```

**All issues across all files (full picture):**

```bash
source ~/.zshrc

FILES=$(curl -s -H "api-token: $CODACY_API_TOKEN" \
  "https://app.codacy.com/api/v3/organizations/gh/jfrappier/repositories/spikefit/files?limit=100")

echo "$FILES" | python3 - << EOF
import sys, json, urllib.request, os

token = os.environ['CODACY_API_TOKEN']
files = json.loads(sys.stdin.read())['data']
base = 'https://app.codacy.com/api/v3/organizations/gh/jfrappier/repositories/spikefit/files'

for f in files:
    req = urllib.request.Request(f'{base}/{f["fileId"]}/issues', headers={'api-token': token})
    issues = json.loads(urllib.request.urlopen(req).read())['data']
    for i in issues:
        print(f'{f["path"]}:{i["lineNumber"]} [{i["patternInfo"]["level"]}] {i["message"]}')
EOF
```

---

## Querying SonarCloud Findings via API

Since SonarCloud uses Automatic Analysis (GitHub-triggered only — the CLI scanner does not work alongside it), findings are queryable via API. Run `source ~/.zshrc` first if you haven't already.

**All open issues for the project:**

```bash
curl -s -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/issues/search?projectKeys=jfrappier_volleyfit&statuses=OPEN" \
  | python3 -m json.tool
```

**Issues on a specific branch or PR:**

```bash
# Branch
curl -s -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/issues/search?projectKeys=jfrappier_volleyfit&branch=main&statuses=OPEN" \
  | python3 -m json.tool

# Pull request
curl -s -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/issues/search?projectKeys=jfrappier_volleyfit&pullRequest=42&statuses=OPEN" \
  | python3 -m json.tool
```

**Security hotspots only:**

```bash
curl -s -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/hotspots/search?projectKey=jfrappier_volleyfit" \
  | python3 -m json.tool
```

Results include file path, line number, severity, rule ID, and message — the same data shown in the SonarCloud PR decoration.

---

## What the Tools Check

| Tool | What it catches |
|---|---|
| Codacy / ESLint | JS issues: unused vars, `window` vs `globalThis`, missing `rel`, equality checks |
| Codacy / Pylint | Python issues: naming conventions, unused imports, missing docstrings |
| Codacy / CSSLint | CSS issues: duplicate properties, unknown properties, specificity problems |
| SonarCloud | Security hotspots, code smells, duplications, complexity, coverage gaps |

**Note on false positives:** Codacy does not recognize QUnit's `QUnit.test()` API as a test framework and flags `acwr.test.js` and `workout-keys.test.js` as "no tests found." These are false positives — the files contain real tests. See `guardrails/review-checklist.md` for guidance on distinguishing real findings from false positives.

---

## Configuration Files

| File | Purpose |
|---|---|
| `.codacy.yml` | Enables/disables Codacy tool engines; lists path exclusions |
| `sonar-project.properties` | Sets project key, organization, source paths, and exclusions for SonarCloud |
