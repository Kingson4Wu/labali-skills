# Workflow Plan

## Guided Runtime Steps

1. Start or reuse Chrome with `remote-debugging-port=9223`, profile `~/.chrome-labali-no-proxy`, and `--no-proxy-server`.
2. Connect over CDP.
3. Open user home page from `user_url`.
4. If login prompts appear, pause for manual login.
5. Pull timeline pages via authenticated web endpoints in the current CDP browser session.
6. If endpoint data is unavailable, fallback to scroll + DOM extraction.
7. Extract post text, publish time, stats, and media URLs.
8. Download images and optional video files.
9. Write `posts.json` and markdown summaries (`user.md`, per-post `post.md`).

## Interactive Inputs

- Prompt for `user_url` when missing.
- Prompt for `output_dir` when missing.

## Pagination/Loading Strategy

- Repeatedly scroll document and timeline-like inner containers.
- Click visible "expand / load more / next page" controls.
- Stop when no growth for multiple rounds or an explicit end-of-feed marker appears.

## Output Contract

```text
<output_dir>/
  <timestamp>-<user_slug>/
    posts.json
    user.md
    posts/
      001-<post_id>/
        post.md
        images/
        videos/
```
