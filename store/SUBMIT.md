# Putting Call Recorder on the Chrome Web Store

Everything that can be prepared is prepared. The steps below need you, because they involve your account, your name and your decisions.

## Before you submit

1. **Make the repository public and turn on GitHub Pages** (Settings, Pages, Deploy from a branch, `main`, folder `/docs`). That gives you the landing page and the privacy policy address the dashboard needs: `https://uditk2.github.io/call-recorder-extension/privacy.html`.
2. **Fill the blanks.** Search `store/` for square brackets: `[Publisher name]` and `[contact email]` in `store/privacy-policy.md`. Both are shown publicly, so use what you want shown. Then run `npm run store:assets` to rebuild `store/privacy-policy.html` and `docs/privacy.html`, and commit.
3. **Upload the social preview** to the repository (Settings, General, Social preview): `docs/social-preview.png`.
4. **Konvene is not in the store build.** The store version has no Konvene page scripts and does not mention it. `npm run build:konvene` makes a version with the Konvene recording badge.
5. **Try it yourself first** on a real call (see "Still to check by a person" in `docs/implementation-plan.md`), on the machine and Chrome you care about.

## Submit

The dashboard cannot be driven by a script (Chrome blocks it), so this part is by hand. It takes about 15 minutes. Every text block is already written.

1. **Developer account.** Done once: sign in at the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) with the Google account that will own the extension, turn on 2-Step Verification, accept the terms, pay the one-time US$5 fee, and declare trader or non-trader (an EU rule, your own legal call). A new account can publish 2 extensions.
2. Run `npm run package` (or use the zip already in `store/package/`). In the dashboard choose **Add new item** and upload `store/package/call-recorder-<version>.zip`.
3. **Store listing tab.** Paste from `store/listing.md`: name, summary, description, category (Productivity), language (English). Upload the icon (it is in the package), `store/screenshots/*.png` (1280 x 800, up to 5) and `store/promo/small-tile-440x280.png`. Set the support URL, homepage URL and privacy policy URL from the "Links" block of `store/listing.md`.
4. **Privacy practices tab.** From `store/permissions.md` paste, in order: the single purpose, then the justification under each permission heading (`tabCapture`, `offscreen`, `activeTab`, `downloads`, `storage`), then the host permission justification (the section about page scripts on Google Meet). Answer "no" to remote code. In the data usage questions tick what `store/permissions.md` says, and tick all three certifications. Add the privacy policy URL.
5. **Test instructions tab.** Paste the "Notes for the reviewer" section of `store/permissions.md`. No account or login is needed.
6. **Distribution tab.** Choose public, all regions, free.
7. **Submit for review.** Choose to publish automatically once approved, or to publish it yourself.

## What to expect

- Review usually takes from a few hours to a few days, and can take longer for extensions with sensitive permissions. `tabCapture`, the microphone and page scripts on named sites mean reviewers will read the permission justifications, so keep them accurate.
- Each update needs a higher `version` in `package.json`. Run `npm run package` again and upload the new zip.
- If a reviewer asks for a change, `npm run check` and `npm run smoke` tell you the extension still works before you resubmit.
- Do not add a permission without a written reason in `store/permissions.md`. `npm run validate` fails the build if you do.

## Make it easier to find

- Keep the listing name, summary and first lines of the description rich in what people search for: "Google Meet", "call recorder", "record calls", "no upload". `store/listing.md` has them.
- Ask early users for a review, and answer them. Ratings and reviews affect ranking in the store.
- Link the store page from the repository README and the landing page once it is live.
