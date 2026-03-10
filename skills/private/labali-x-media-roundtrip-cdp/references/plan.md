# Plan

## Stage 1: Runtime Precheck

- Validate `input_file` exists.
- Validate `output_file` parent directory exists or can be created.
- Check Chrome CDP endpoint readiness.
- If endpoint is down, launch Chrome with `scripts/launch-chrome-cdp.sh`.
- Connect over CDP.
- Check X page status and open `https://x.com/home` when needed.
- Check login status; if not logged in, open login flow and continue after login completion.

## Stage 2: Upload and Publish

- Open X compose page.
- Upload `input_file`.
- Publish temporary post using `post_text`.

## Stage 3: Capture and Download

- Open published post.
- Extract media URL.
- Download media and write to `output_file`.

## Stage 4: Cleanup

- Delete temporary post.
- Verify post is no longer visible in user timeline/post permalink.

## Stage 5: Return

- Return:
  - `media_url`,
  - `output_file`,
  - `post_deleted=true|false`.
