# Autocomplete Portal Live Verification — 2026-08-26

The live production page was tested after deploying the autocomplete portal fix.

- District / Area list: `display: block`, `position: fixed`, `z-index: 2147483000`, parent `BODY`, 15 visible items.
- A hit-test with `document.elementFromPoint` returned the list item itself, confirming the list is above underlying content and receives pointer interaction.
- Project / Building Name list: `display: block`, `position: fixed`, `z-index: 2147483000`, parent `BODY`; the first item also passed the hit-test.
- The portalized lists are repositioned from the input bounding rectangle and are recalculated on scroll and resize.
- Production deploy tested: `6a8e9029e0a6ae5ab1a0cd0d`, state `ready`.

The current implementation uses a body-level fixed overlay rather than relying on section or card stacking contexts.
