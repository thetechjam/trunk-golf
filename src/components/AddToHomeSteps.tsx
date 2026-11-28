import { AddSquareIcon, ShareIcon } from '../icons';
import { isIOS } from '../platform';

/**
 * The two taps that put Trunk on the home screen, drawn as the buttons they
 * are: Share, then Add to Home Screen. Each tile carries its label as real
 * text, so a screen reader reads the steps and the icons stay decorative; the
 * chevron between them is CSS.
 *
 * Desktop Safari has no Share-sheet item for it: there the steps are the File
 * menu and Add to Dock, in words only.
 */
export function AddToHomeSteps() {
  const ios = isIOS();
  return (
    <ol className="a2hs-steps">
      {ios ? (
        <>
          <li className="a2hs-step">
            <ShareIcon size={20} />
            <span>Tap Share</span>
          </li>
          <li className="a2hs-step">
            <AddSquareIcon size={20} />
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
