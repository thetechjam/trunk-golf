/**
 * Puts focus on the screen's <h1> when a card on it closes.
 *
 * A card's last button unmounts with the card, and focus would fall to
 * <body>: the next Tab starts again from the top and a screen reader hears
 * nothing. Every screen's <h1> carries tabIndex={-1} for App's navigation
 * focus, so it takes this too.
 *
 * preventScroll, unlike App's on navigation: the user is part-way down the
 * same screen and should stay where they are.
 */
export function focusScreenHeading(): void {
  document.querySelector<HTMLElement>('.screen h1')?.focus({ preventScroll: true });
}
