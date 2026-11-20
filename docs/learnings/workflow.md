# Workflow

- **Worktree per change.** Branch in `../civ3-web-assist-<topic>` from `master`; copy `local-data/` into it (the
  worktree doesn't have it). `git worktree remove --force` deletes that copy; the originals are in `~/Downloads`
  (`maya.SAV`, `conquests.biq`, `Civ3Conquests-Unmodded.exe`).
- **Build and test before showing.** `python3 build.py`, `node tests/synth.js`, then a Playwright script against
  `index.html` with `local-data/` files (check behaviour, `pageerror`s, phone width 390px without sideways scroll, dark
  theme). Mock data: `node tests/mock.js --turns 30`.
- **Show a local demo, then wait.** Open the worktree's `index.html` in Chrome (`open -a "Google Chrome"`), give the
  load steps and screenshots. The player approves **every** push; an unapproved push is blocked by the auto-mode
  classifier.
- **Push** to the personal GitHub through the SSH alias, with timeouts (a plain fetch once hung):
  `GIT_SSH_COMMAND="ssh -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=3" git push origin <branch>:master`.
  A first push failing with "access rights" was a connection hiccup; retrying worked.
- **After a push:** fast-forward the main checkout (`git -C ../civ3-web-assist merge --ff-only <branch>`), remove the
  worktree and branch, and poll `https://iamthehttp.github.io/civ3-web-assist/` with curl until the new code is live.
- **Commit messages** describe the change; history doesn't go into code or docs.
