# Workflow

- **Worktree per change.** Branch in `../civ3-web-assist-<topic>` from `master`; copy `local-data/` into it (the
  worktree doesn't have it). `git worktree remove --force` deletes that copy; the originals are in `~/Downloads`
  (`maya.SAV`, `conquests.biq`, `Civ3Conquests-Unmodded.exe`).
- **Build and test before showing.** `python3 build.py`, `node tests/synth.js`, then headless Chrome against the real
  save. No Playwright on this Mac (the player declined a venv). Method: copy `index.html` to the scratchpad with an extra
  `<script>` before `</body>` that `fetch`es `file://…/local-data/conquests.biq` and `maya.SAV`, calls `useRules` and
  `load`, drives the page (`state`, `render`, `openPanel`, `effectOf`…) and writes results plus `window` errors into a
  `<pre>`; run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
  --allow-file-access-from-files --user-data-dir=<scratch> --virtual-time-budget=20000 --dump-dom file://…` and read the
  `<pre>`; `--screenshot=… --window-size=1600,900` for images. IndexedDB never resolves under the virtual clock: replace
  `HistoryStore.put/list/clear` with an in-memory array in the probe. Mock data: `node tests/mock.js --turns 30`.
- **Show a local demo, then wait.** Open the worktree's `index.html` in Chrome (`open -a "Google Chrome"`), give the
  load steps and screenshots. The player approves **every** push; an unapproved push is blocked by the auto-mode
  classifier.
- **Push** to the personal GitHub through the SSH alias, with timeouts (a plain fetch once hung):
  `GIT_SSH_COMMAND="ssh -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=3" git push origin <branch>:master`.
  A first push failing with "access rights" was a connection hiccup; retrying worked.
- **After a push:** fast-forward the main checkout (`git -C ../civ3-web-assist merge --ff-only <branch>`), remove the
  worktree and branch, and poll `https://iamthehttp.github.io/civ3-web-assist/` with curl until the new code is live.
- **Commit messages** describe the change; history doesn't go into code or docs.
