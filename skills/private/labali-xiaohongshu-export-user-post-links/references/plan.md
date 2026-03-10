# Workflow Plan

## Stage 1: Browser Session
- Launch/reuse Chrome with CDP.
- Open Xiaohongshu home page.
- If login state appears, prompt manual login and continue.

## Stage 2: Inputs
- Resolve `profile_url` and `output_path` from flags or interactive prompts.
- Normalize output file path (if directory provided, generate file name automatically).

## Stage 3: Profile Open
- Navigate to profile URL.
- Wait for initial content and state hydration.

## Stage 4: Post Link Extraction Loop
- Parse notes from `__INITIAL_STATE__.user.notes._value`.
- Extract `noteId` and `xsecToken` from card fields.
- Build final links and dedupe.
- Scroll page and repeat until no new links are discovered over threshold rounds.

## Stage 5: Output
- Write final links to output file (one per line).
- Return counts and output path summary.
