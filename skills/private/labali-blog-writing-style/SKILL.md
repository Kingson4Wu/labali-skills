---
name: labali-blog-writing-style
description: Create, rewrite, or refine personal blog posts in Kingson Wu's established voice for Chinese technical essays, workplace reflections, and reading notes. Use when the task is to draft a new article, revise an existing post, or make AI-written content sound like the author's earlier blog voice while preserving core meaning and improving structure, hierarchy, and readability.
license: MIT
compatibility: AI agent environment only; no system dependencies.
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

## Execution Contract

1. Identify the article mode first:
   - new article,
   - rewrite of an existing article,
   - partial refinement of selected sections.
2. Identify the article subtype:
   - technical summary,
   - troubleshooting / postmortem,
   - workplace reflection,
   - reading note / idea note.
3. Read `references/style-profile.md` before drafting or revising.
4. Read `references/workflow.md` and apply the matching workflow for the current mode.
5. Keep the author's stable traits:
   - pragmatic judgment,
   - direct but reasoned tone,
   - engineering tradeoff awareness,
   - mild personal sharpness without empty emotional venting.
6. Do not copy weaknesses from older posts:
   - avoid overly fragmented bullet piles,
   - avoid weak hierarchy,
   - avoid note-like stacking without transitions,
   - avoid loose section boundaries.
7. Prefer article-shaped prose with selective lists only where lists add clarity.
8. Preserve core facts, claims, and intent unless the user explicitly asks for substantive changes.
9. When revising, improve structure first, then wording.
10. Keep the final text in Chinese unless the user explicitly requests another language.

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
