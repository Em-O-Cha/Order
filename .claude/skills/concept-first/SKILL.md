---
name: concept-first
description: Use whenever the user requests a new feature, behavior change, or non-trivial fix to this CRM (gas-crm/ Apps Script backend + Index.html frontend, mirrored to Em-O-Cha/Order and Em-O-Cha/CRM-SpunkyFood). Before writing or editing any code, summarize the proposed concept back to the user and get their explicit go-ahead. Skip this for trivial one-line fixes, typo/wording corrections, or requests that are already fully specified (exact field names, exact copy, "just do X" with no ambiguity left). The user has been burned by back-and-forth rework and explicitly asked for this: "คุยคอนเซปกันก่อนว่าจะทำอะไร จะได้เข้าใจตรงกัน ไม่ต้องมานั่งแก้กันไปมา".
---

# คุยคอนเซปก่อนลงมือ (Concept before code)

The user runs Spunky Food's CRM and has been iterating on it over many small
requests. The pattern that burned time in the past: jumping straight to
implementation on an ambiguous request, guessing wrong on a design detail
(where a field lives, what triggers what, which value goes where), then
redoing it once the user clarifies what they actually meant. Confirming the
shape of the change up front is cheap; re-doing a wired-up feature is not.

## When to pause and confirm

Trigger this for anything that adds a feature, changes behavior, or touches
more than a trivial detail — new fields, new UI flows, new reminder/automation
logic, changes to what gets written where (e.g. which sheet/column a value
lands in), anything with more than one reasonable way to build it.

Skip it when the request is already unambiguous: a one-line copy fix, a typo,
a color tweak, or something the user has already specced down to the exact
field/value/location (as happened with "เอามาแต่ชื่อสินค้าเท่านั้น" — no
open questions left, just do it).

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
