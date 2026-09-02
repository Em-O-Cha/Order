---
name: confirm-before-changes
description: Guardrail for this project (LINE shop ordering system — index.html frontend + "Members LINE" Google Apps Script backend). Use this BEFORE writing or editing any file, or before delegating a code-modifying task to a subagent — including bug fixes, performance tweaks, refactors, config edits, or "small"/"obvious" changes. It does NOT apply to read-only work (reading files, searching, running analysis agents, browsing Google Drive/Sheets, explaining code) — that can proceed freely. Always consult this skill before the first Edit/Write/NotebookEdit call of a turn that touches this project's code, and before spawning any agent whose job is to modify files here.
---

# Confirm before changing anything

The user working on this project wants to review and approve every change before it happens — not after. This is a standing preference for this project, not a one-time instruction, so it applies to every future session and every kind of change: frontend (`index.html`, `slipUpload.html`), backend (the Apps Script project "Members LINE" in Google Drive), config, or anything else in scope.

## Why this matters here

This project runs live for real customers (order flow, payment, discounts, points). A change that looks like a small, safe cleanup can still shift behavior customers depend on — so the user wants a chance to say "yes, do that" or "no, not that" before code changes, not just to read a summary afterward.

## What requires asking first

Ask before any of these, every time, no matter how small or "obviously correct" it seems:
- Writing or editing a file with Edit/Write/NotebookEdit (frontend HTML/JS, or backend `.gs` files pulled from the Apps Script project)
- Pushing an edit to the Google Apps Script project itself (via Drive/Apps Script tools), not just local files
- Delegating to a subagent with instructions to modify code, fix something, or "go ahead and apply this"
- Committing and pushing changes, even to a feature branch (asking before the edit generally covers this, but if new changes accumulate before a push, confirm the push too)

## What does NOT require asking first

Keep moving on anything read-only — asking before these would just slow down getting to an answer:
- Reading files, greping/searching the codebase or Drive
- Downloading/decoding the Apps Script project to inspect it
- Running analysis-only subagents (e.g. "find performance bottlenecks", "explain how X works")
- Explaining findings, proposing options, or drafting a plan in chat

## How to ask

Before the first modifying action in a turn:
1. Say concretely what you want to change and in which file(s)/function(s) — enough detail that the user can say yes/no without having to read a diff themselves.
2. Say why (what problem it fixes or what it improves), and flag anything risky (e.g. touches discount/points math, live payment flow).
3. Wait for explicit approval — a clear "yes"/"ทำเลย"/"ok" or equivalent — before calling Edit/Write or telling a subagent to make the change. A vague acknowledgment of the explanation is not the same as approval to proceed; if in doubt, ask directly.

If the user has already approved a specific, scoped change (e.g. "yes, fix the two things you listed"), you don't need to re-ask for each individual Edit call within that already-approved scope — but do ask again if you find something additional beyond what was approved, or if the approved plan changes once you're in the code.

Use plain chat to ask, or `AskUserQuestion` when there are genuinely distinct options to choose between (e.g. two different ways to fix something). Either is fine — the point is getting a yes before touching a file, not the mechanism.
