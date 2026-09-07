---
name: guide-nontechnical-edits
description: Use whenever walking a non-technical user (e.g. the Em-O-Cha shop owner) through editing code, config, or files in this repo — especially Google Apps Script (the LINE bot, the order backend) or the GitHub web UI. Trigger this any time you're about to say "edit this function", "add this to your project", "paste this in", or similar, even if the user doesn't ask for it by name. Always cite exact line numbers from the actual current file and give concrete click-by-click navigation steps instead of assuming familiarity with a code editor.
---

# Guiding a non-technical user through code edits

The person on the other end of this conversation is not a developer. They run a
shop and use Google Sheets, LINE, and the Apps Script editor because they have
to, not because they're comfortable in them. Instructions that would be totally
clear to an engineer — "edit the setupCredentials function", "add a new file",
"deploy as a web app" — leave them stuck, because they don't know which of two
similarly-named functions you mean, where in the editor's UI a "file" even
lives, or what "deploy" does to their running app.

This skill exists because that confusion already happened once in this
project: there were two functions named `setupCredentials` and
`EmOChaOrderBot_setupCredentials`, and the user pasted back the wrong one
because nothing distinguished them clearly enough. The fix isn't more caution
in general — it's specificity, every single time.

## Before telling the user to change anything

**Re-read the actual current file first.** Don't recall line numbers from
memory or from an earlier version of the file in this conversation — files
change (yours and the user's own edits), and a stale line number sends them to
the wrong place with total confidence. Use the Read tool right before giving
directions so the numbers you cite are true right now.

## Always cite exact locations

Give a specific anchor, not a description of what to look for:

- **Good**: "Open `line-bot/dailyOrderSummary.gs`, go to line 439 — the
  function `EmOChaOrderBot_setupCredentials()` — and replace lines 442-445."
- **Not good enough**: "Edit the setup function and put your token in."

If the change is small, just show the exact block to paste over, with the
line numbers labeled, rather than describing the edit in prose. A user who
isn't fluent in reading code diffs can match text to text far more reliably
than they can follow "add a comma after the second argument."

## Always disambiguate similarly-named things — every time, not just once

When two functions, files, or variables share part of a name (as happened
with `setupCredentials` vs. `EmOChaOrderBot_setupCredentials`, or when a
project has more than one file that could plausibly be "the" file), never
refer to it by the short/ambiguous name alone, even after you think you've
already clarified it earlier in the conversation. State the full name and
where it lives every time:

- "the function `EmOChaOrderBot_setupCredentials()` near the **bottom** of
  the file (not the plain `setupCredentials` one in the middle, which you
  should leave untouched)"

Assume the reader is skimming, not tracking the conversation's full history.
Repetition here costs you a sentence; ambiguity costs them a broken script
and another round of screenshots.

## Give concrete, click-by-click navigation — not just code

For anything that happens in a UI rather than in text (Google Apps Script
editor, GitHub's web interface, LINE Developers Console), name the actual
button, menu, or icon, in order, as if narrating over someone's shoulder:

- "In the left sidebar, find **Files**. Click the **+** next to it, choose
  **Script**. Name the new file anything, e.g. `LineOrderBot`, press Enter."
- "Click the function dropdown next to the **Run ▶** button at the top, pick
  `EmOChaOrderBot_setupCredentials` from the list, then click **Run**."

Don't assume they know what "deploy", "trigger", "commit", "clone", or
"webhook" mean — if you have to use the term, add a short plain-language
gloss the first time in a given explanation ("Deploy — this publishes the
script so LINE's servers can reach it").

When a change involves a whole file rather than a small edit, prefer handing
them the finished file directly (via SendUserFile, or a GitHub link with the
"copy raw file" button called out explicitly) over asking them to
hand-transcribe a diff.

## When something goes wrong

If they paste back an error or a screenshot, don't guess which file or line
it's about — ask, or better, work it out from what's visible (a file name in
the stack trace, a line number in the error) and say so explicitly before
proposing the fix. Confirming "this error is from `Report Sales.gs` line 1,
which is a different file than the one we just edited" is often more useful
than the fix itself, because it re-orients them to what they're looking at.
