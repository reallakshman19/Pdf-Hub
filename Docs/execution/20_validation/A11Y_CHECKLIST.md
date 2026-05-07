# Accessibility (A11y) Checklist

This checklist defines the core accessibility standards that must be met prior to release. Agent A8 will lead verification, but all agents must implement components complying with these rules.

Status: Partial. Keyboard semantics are implemented for thumbnails/context menu, but full browser + assistive-tech verification is still required.

## Keyboard Navigation
- [ ] All interactive elements (buttons, inputs, links, thumbnails) are accessible via the `Tab` key.
- [ ] The focus order is logical and follows the visual layout of the page.
- [ ] A visible focus indicator is present on all active elements.
- [ ] Modal dialogs trap focus within the dialog until dismissed.
- [ ] Complex widgets (like the thumbnail grid or sidebar review filters) support appropriate arrow-key navigation.

## ARIA and Screen Readers
- [ ] Interactive elements missing native semantic HTML tags have appropriate `role` attributes.
- [ ] State changes (e.g., expanding a sidebar, toggling a view mode) are announced using `aria-expanded`, `aria-pressed`, or `aria-live` regions.
- [ ] Icon-only buttons (e.g., toolbar actions) have descriptive `aria-label` or `aria-labelledby` attributes.
- [ ] Error messages and form validations are announced to screen readers.

## Visual Design
- [ ] Text contrast meets WCAG AA standards (minimum 4.5:1 for normal text).
- [ ] Information is not conveyed by color alone (e.g., search hit highlighting must have sufficient contrast and possibly a textural/shape cue if appropriate).
- [ ] UI is robust when scaled or zoomed.

## Specific Components
- [ ] **Thumbnails:** Right-click menus can be opened via keyboard (e.g., Shift+F10 or context menu key).
- [ ] **Search:** Active search hit navigation can be operated entirely via keyboard.
- [ ] **Macros:** Output logs and queues are readable and updates are announced.
