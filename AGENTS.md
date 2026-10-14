<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Frontend conventions
- Apply shared interface changes through global semantic tokens and existing common components; this keeps every working screen consistent without duplicating UI or altering domain logic.
- Keep the desktop navigation expanded unless the user collapses it; visible section labels support orientation across laptop and desktop screens.
