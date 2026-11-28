import type { Ref } from 'react';
import { AddSquareIcon, ShareIcon } from '../icons';
import { isIOS } from '../platform';

/**
 * The two taps that put Trunk on the home screen: Share, then Add to Home
 * Screen. Drawn as a numbered list of instructions with each icon inline, not
 * as tiles — tiles read as buttons, and these do nothing when tapped. Each
 * step carries its label as real text, so a screen reader reads the steps
 * and the icons stay decorative.
 *
 * Desktop Safari has no Share-sheet item for it: there the steps are the File
 * menu and Add to Dock, in words only.
 *
 * With a `ref`, the list can take focus (tabIndex -1), for the card that
 * reveals it to move focus here.
 */
export function AddToHomeSteps({ ref }: { ref?: Ref<HTMLOListElement> } = {}) {
  const ios = isIOS();
  return (
    <ol className="a2hs-steps" ref={ref} tabIndex={ref ? -1 : undefined}>
      {ios ? (
        <>
          <li className="a2hs-step">
            <ShareIcon size={18} />
            <span>Tap Share</span>
          </li>
          <li className="a2hs-step">
            <AddSquareIcon size={18} />
            <span>Add to Home Screen</span>
          </li>
        </>
      ) : (
        <>
          <li className="a2hs-step">
            <span>File menu</span>
          </li>
          <li className="a2hs-step">
            <span>Add to Dock</span>
          </li>
        </>
      )}
    </ol>
  );
}
