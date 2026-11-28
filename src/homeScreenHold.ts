/**
 * Holds the Home Screen card back for the rest of this app session.
 *
 * Answering the backup card on Results ("Not now", "Don’t remind me" or
 * Done) and tapping Home used to put the Home Screen card straight up: one
 * message per screen, but two in a minute. After that answer, Home leaves the
 * Home Screen card for the next launch.
 *
 * In memory only, on purpose: nothing is stored, so a reload or the next
 * launch shows the card as before.
 */
let held = false;

export function holdHomeScreenCard(): void {
  held = true;
}

export function homeScreenCardHeld(): boolean {
  return held;
}

/** For tests: a fresh app session. */
export function releaseHomeScreenCard(): void {
  held = false;
}
