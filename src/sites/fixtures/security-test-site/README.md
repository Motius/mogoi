# Security Test Site (Fixture)

Browser-based attack suite for the site builder proxy. Tests iframe sandbox,
same-origin isolation, WebSocket origin checks, and capability restrictions.

## Usage

Copy to the Mogoi projects directory, install, and open in the Sites page:

```sh
cp -r src/sites/fixtures/security-test-site ~/.mogoi/projects/security-test
cd ~/.mogoi/projects/security-test
bun install
git init && git add -A && git commit -m "init"
```

Then open the Mogoi dashboard, go to Sites, and start the `security-test` project.
All 28 tests should show **BLOCKED**.
