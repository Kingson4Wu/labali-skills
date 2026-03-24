---
name: labali-blog-writing-style
description: Create, rewrite, or refine personal blog posts in Kingson Wu's established voice for Chinese technical essays, workplace reflections, and reading notes. Use when the task is to draft a new article, revise an existing post, or make AI-written content sound like the author's earlier blog voice while preserving core meaning and improving structure, hierarchy, and readability.
license: MIT
compatibility: AI agent environment only; no system dependencies.
metadata:
  pattern: inversion+generator
  interaction: multi-turn
  output-format: markdown
---

# labali-blog-writing-style

Use this skill when writing or revising blog articles for the user's personal blog in the user's established voice.

## Runtime Inputs

- Target article path or article topic.
- User intent: new draft, rewrite, refine, shorten, or expand.
- Existing article text when revising.
- Optional constraints such as word count, article type, or sections to preserve.

## Core Goal

Preserve the author's voice and judgment style while improving article quality.

The target result is:

- sounds like the author,
- keeps the original article's core meaning,
- has clearer structure than many older posts,
- reads like a finished article rather than scattered notes.

## NEVER

- Never produce fragmented bullet piles as the primary structure — use paragraphs as the default form.
- Never stack sections without transitions (note-like accumulation of disconnected blocks).
- Never use weak hierarchy where all headings carry the same visual weight regardless of content importance.
- Never output AI-style abstraction drift: phrases like "it's important to note that", "in conclusion", or "overall, this demonstrates".
- Never switch the output language to English unless the user explicitly requests it.

## Mode × Subtype Routing

Use this table to determine which file sections to load in Phase 2.

### Mode → workflow section in `references/workflow.md`

| Mode | Section to load |
|------|----------------|
| new draft | `## 1. New Article Workflow` |
| rewrite | `## 2. Rewrite Existing Article Workflow` |
| partial refinement | `## 3. Partial Refinement Workflow` |
| shorten | `## 4. Structure Rules` (no dedicated section — use structure rules as guide) |
| expand | `## 4. Structure Rules` (no dedicated section — use structure rules as guide) |

### Subtype → skeleton section in `assets/article-structure.md`

| Subtype | Section to load |
|---------|----------------|
| technical summary | `## Subtype: Technical Summary` |
| troubleshooting / postmortem | `## Subtype: Troubleshooting / Postmortem` |
| workplace reflection | `## Subtype: Workplace Reflection` |
| reading note / idea note | `## Subtype: Reading Note / Idea Note` |

## Execution Contract

### Phase 1 — Inversion (gather before generating)

DO NOT proceed to Phase 2 until all required inputs are known.

Ask the user for any missing required inputs:

1. **Mode** (required): new draft, rewrite, partial refinement, shorten, or expand.
2. **Subtype** (required): technical summary, troubleshooting/postmortem, workplace reflection, or reading/idea note.
3. **Article content or topic** (required): existing article text, or topic + key points for a new draft.
4. **Constraints** (optional): word count target, sections to preserve, language override.

If all inputs are present in the user's initial message, skip asking and proceed directly to Phase 2.

### Phase 2 — Generator (load and produce)

Execute in fixed order:

1. Load `references/style-profile.md` — establish voice and stable trait rules.
2. Load `references/workflow.md` — apply the matching workflow for the current mode.
3. Load `assets/article-structure.md` — use the skeleton for the identified subtype as structural scaffolding.
4. Apply the author's stable traits:
   - pragmatic judgment,
   - direct but reasoned tone,
   - engineering tradeoff awareness,
   - mild personal sharpness without empty emotional venting.
5. Avoid copying weaknesses from older posts:
   - no fragmented bullet piles,
   - no weak hierarchy,
   - no note-like stacking without transitions,
   - no loose section boundaries.
6. Prefer article-shaped prose; use lists only for inherently list-shaped content.
7. Preserve core facts and intent unless the user asks for substantive changes.
8. When revising: improve structure first, then wording.
9. Keep final text in Chinese unless the user explicitly requests another language.
10. Output the complete article.

## Output Rules

- Start with a short lead-in or context when helpful.
- Use clear section hierarchy.
- Use paragraphs as the default form.
- Use lists only for inherently list-shaped content such as comparisons, steps, or categorized points.
- End with a grounded summary, not forced uplift.

## Editing Priorities

Apply these priorities in order:

1. Preserve meaning and viewpoint.
2. Match the author's voice.
3. Improve structure and hierarchy.
4. Improve readability and transitions.
5. Tighten wording and remove AI-style abstraction drift.

## Resources

- Voice and style profile: `references/style-profile.md`
- Writing and revision workflow: `references/workflow.md`
