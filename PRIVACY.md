# Privacy

Trunk keeps score for golf side games. It has no accounts, no analytics and
no server that stores your rounds. This page says exactly what the app does
with your data, in plain English. It matches the code; if the code changes,
this page changes with it.

## Where your data lives

Everything Trunk saves — rounds, scores, players' names and handicaps,
stakes, saved courses, merged-name records and your settings — is stored in
your browser, on your device, in the browser's local storage for this site
(trunk.golf, or pressgolf.netlify.app if that is where you opened Trunk).
Browsers keep that storage separately for each site address, so anything
saved while using the app at another address stays with that address. That
older address is being retired: rounds saved there stay there until you save
a backup there and restore it at trunk.golf, where the app now lives. Nothing
is copied to a server. Trunk asks the browser to treat that storage as
persistent so it is not cleared when space is tight; installing Trunk to your
home screen is the surest way to keep it.

Your settings also record when you last saved a backup, so Trunk can say how
many rounds have changed since. That date stays on this device and is not put
in the backup file. Safari deletes a site's saved data after seven days
without a visit. Adding Trunk to your home screen exempts it from that limit,
though the home screen app keeps its own storage, separate from Safari's, and
starts empty: save a backup in Safari and restore it there to bring your
rounds across.

There are no cookies, no tracking pixels, no third-party scripts and no
usage analytics. The app's own files are cached on your device by a service
worker so it opens with no signal.

## What leaves your device, and when

Nothing leaves your device unless you do one of these things:

- **Course search.** When you type three or more characters into the course
  field on New Round, that text is sent to `api.opengolfapi.org` to look up
  matching courses, and picking a result fetches that course's scorecard from
  the same service. Nothing about you or your round is sent — only what you
  typed. If that service does not answer, or finds nothing, Trunk searches its
  offline course list instead: the list is downloaded from this site (the same
  file for everyone, with nothing you typed in the request), kept by the
  service worker, and searched on your device, so an offline search sends
  nothing. Contains data from OpenGolfAPI (opengolfapi.org), © OpenStreetMap
  contributors, ODbL 1.0; the offline list is published under the same licence
  at https://trunk.golf/courses/opengolfapi-us.json.
- **Scanning a scorecard.** On New Round, Scan the card sends one photo you
  pick to Trunk's server (a Netlify function at trunk.golf/api/scan-card) and
  on to Anthropic's API, where an AI model reads the pars and stroke indexes
  off it. Before it leaves your device the photo is shrunk and re-encoded,
  which drops location and camera details stored in the file. Whatever is in
  the frame goes with it, handwriting included — names and scores written on
  the card too — so photograph the printed card rather than a filled-in one.
  Trunk's code neither stores nor logs the photo or what was read from it; it
  logs only that a scan happened, which model answered, how long it took, how
  many tokens it used and whether it worked. Netlify, which runs the function,
  and Anthropic, which runs the model, handle the request under their own
  terms: [Netlify's privacy policy](https://www.netlify.com/privacy/) and
  [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy).
  Nothing is sent until you pick a photo, and nothing that was read is used
  until you tap to use it.
- **Sending feedback.** Settings → Send feedback posts what you write — the
  report, and your name if you give one — together with a few diagnostics
  (which screen you were on, the app version and build, your browser's
  user-agent string, the screen size and the time) to Netlify Forms, the
  hosting company's form service, which emails it to the developer. The round
  you are on is included **only** if you tick "Include this round", which is
  off every time you open the form; ticking it sends the players' names,
  scores and settings. A report written with no signal waits on your device
  and is sent when you are back online.
- **Sharing a round by link or QR code.** The whole round — names, scores,
  handicaps, stakes, presses, junk — is packed into the link itself, after
  the `#`. Browsers never send that part of a link to any server, including
  ours, so the round goes only to whoever you give the link to. The link is
  **compressed, not encrypted**: anyone who has it can open it and read the
  names, scores and stakes inside, and it will sit in the history of whatever
  app you sent it through. Share a link the way you would share the scorecard
  itself.
- **Sharing an image or text.** The scoreboard and scorecard images are drawn
  on your device and handed to your phone's share sheet, or saved as a file.
  Where they go from there is up to you and the app you pick.
- **Backups.** Back up from Settings writes a plain JSON file containing every
  round, saved course and merged-name record on the device. It is not
  encrypted. You keep it; restoring one merges it back.
- **Links to other sites.** The tip jar (Buy Me a Coffee) and the
  OpenStreetMap credit are ordinary links that open those sites, which have
  their own privacy policies. Nothing is sent to them until you tap.

Trunk is served by Netlify. Like any website, loading or updating the app
sends ordinary requests for its files, which the host sees as it would for
any site (your IP address, your browser). Trunk adds nothing to those
requests and reads nothing back from them.

## Deleting your data

- **Rounds:** Rounds → Select, pick the ones to remove, delete. Or the × on
  a single round's card.
- **Saved courses:** New Round → Course → the × beside a saved course.
- **Feedback waiting to send:** Settings → Clear waiting reports.
- **Everything at once:** Settings → Erase everything. The first tap says
  what goes; the second removes every round, saved course, player name,
  feedback waiting to send and setting Trunk has stored, and the app opens
  again as it did the first time. The same result without opening the app:
  clear the site's data in your browser (on iPhone, Settings → Safari →
  Advanced → Website Data; on Android Chrome, the site's page info → Site
  settings → Delete data), or uninstall the installed app.

A round that someone else sent you by link is not saved until you tap
"Keep it".

## Questions

Open an issue at github.com/thetechjam/trunk-golf, or use Send feedback in
the app. Trunk is made by one person; you will get a reply from him.
