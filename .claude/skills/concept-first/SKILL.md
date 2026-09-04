---
name: concept-first
description: Use before EVERY code change on this CRM (gas-crm/ Apps Script backend + Index.html frontend, mirrored to Em-O-Cha/Order and Em-O-Cha/CRM-SpunkyFood) — new feature, bug fix, or copy tweak alike. Before writing or editing any code, restate what you understood and what you're about to change, and get the user's explicit "yes, that's right" before touching a file. This is a standing working agreement the user set, not a per-request judgment call: "ทุกครั้งก่อนจะดำเนินการ ถือเป็น Skill และการทำงานระหว่างกันเลยนะ เธอต้องคอนเฟิมก่อนว่าจะทำอะไร ฉันโอเค ด้วยกับความเข้าใจของเธอหรือเปล่า" (every time, before proceeding — confirm what you're about to do and check I'm okay with your understanding).
---

# คุยคอนเซปก่อนลงมือ (Concept before code)

The user runs Spunky Food's CRM and has been iterating on it over many small
requests. The pattern that burned time in the past: jumping straight to
implementation on an ambiguous request, guessing wrong on a design detail
(where a field lives, what triggers what, which value goes where), then
redoing it once the user clarifies what they actually meant. Confirming the
shape of the change up front is cheap; re-doing a wired-up feature is not.

The user later made this explicit and unconditional: this isn't a judgment
call to make per-request anymore — it's the standing agreement for how we
work together on this project. Confirm first, every time, by default.

## When to pause and confirm

**Every time**, before editing any `gas-crm/*.gs` or `Index.html` code —
new feature, behavior change, bug fix, or a small tweak alike. Restate what
you understood you're about to do and get an explicit "ใช่/โอเค" before
touching a file.

The only thing that skips the confirmation step is the user directly typing
the literal text to put somewhere (an exact label, an exact value) with
nothing left to interpret — even then, a one-line "โอเคจะแก้ตรงนี้นะ" as
you go is fine and costs nothing. When in doubt, confirm. Don't reach for
"this one's obviously simple" as a reason to skip it — that judgment call is
exactly what this skill exists to remove from your hands.

## What to do

1. **Restate the request as a short concept**, in the user's own terms where
   possible (Thai is fine, that's how they write to you):
   - ปัญหาที่แก้ / ที่มา (what problem this solves)
   - จะเปลี่ยนอะไรบ้าง and ที่ไหน (what changes, in which file/screen/sheet
     column — be concrete: "ช่องนี้ในป็อปอัพ X" not "the UI somewhere")
   - ผลกระทบข้างเคียง ถ้ามี (side effects — e.g. "จะกระทบข้อมูลเก่าที่เคย
     บันทึกไปแล้วไหม")

2. **Call out open decisions explicitly** rather than silently picking one.
   If there's a genuine fork (e.g. "ควรใช้ค่าเริ่มต้นจากอะไร", "ควรบังคับกรอก
   หรือปล่อยว่างได้"), name the options and your recommendation — don't just
   implement your best guess and let the user discover it later.

3. **Ask for confirmation before touching code.** A short "ตรงตามที่คิดไว้ไหม
   หรืออยากปรับตรงไหน" is enough — this doesn't need to be a big ceremony,
   just a checkpoint. Use `AskUserQuestion` when there's a concrete fork to
   pick between; a plain question in text is fine when it's just "does this
   match what you meant."

4. **Only after the user confirms (or clarifies), implement** — following the
   project's existing workflow: edit the relevant `gas-crm/*.gs`/`Index.html`
   files, verify with the mock test harness (`/tmp/gas-mock/`, or wherever the
   current session's harness lives) before pushing, then commit and push to
   both `Em-O-Cha/Order` (branch `claude/crm-export-system-ipapok`) and
   `Em-O-Cha/CRM-SpunkyFood` (`main`, remembering the lowercase `index.html`
   filename and the `DEFAULT_API_URL` injection for that copy), and tell the
   user exactly which files to re-upload to script.google.com and redeploy.

## What this is not

This isn't a demand for a formal spec doc or a multi-round design review —
one clear paragraph and a yes/no (or a pick-one) is usually the whole
exchange. The goal is catching a wrong assumption in one message instead of
in a finished implementation.
