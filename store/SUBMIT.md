# Putting Call Recorder on the Chrome Web Store

Everything that can be prepared is prepared. The steps below need you, because they involve your account, your name and your decisions.

## Before you submit

1. **Make the repository public and turn on GitHub Pages** (Settings, Pages, Deploy from a branch, `main`, folder `/docs`). That gives you the landing page and the privacy policy address the dashboard needs: `https://uditk2.github.io/call-recorder-extension/privacy.html`.
2. **Fill the blanks.** Search `store/` for square brackets: `[Publisher name]` and `[contact email]` in `store/privacy-policy.md`. Both are shown publicly, so use what you want shown. Then run `npm run store:assets` to rebuild `store/privacy-policy.html` and `docs/privacy.html`, and commit.
3. **Upload the social preview** to the repository (Settings, General, Social preview): `docs/social-preview.png`.
4. **Check the look.** The logo is new. The colours and fonts follow Konvene's look (bottle green, brass, Instrument Sans, Bricolage Grotesque), and the text says "Konvene" where it supports Konvene. Make sure the owners of Konvene are happy with that.
5. **Deploy the Konvene change** (the badge, in `src/main.js`, pull request 5 on rakeshmenon/konvene). The extension refuses to record on Konvene until the live page confirms its badge.
6. **Try it yourself first** on a real call (see "Still to check by a person" in `docs/implementation-plan.md`), on the machine and Chrome you care about.

## Submit

1. **Developer account.** Open the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole), sign in with the Google account that will own the extension, turn on 2-Step Verification for it, accept the terms and pay the one-time registration fee of US$5. It covers every extension you publish later.
2. **Trader status.** The dashboard asks you to declare whether you are a trader or a non-trader (an EU rule). A free open source extension published by an individual is usually a non-trader, but it is your own legal call. A trader's name, address and phone number are shown publicly on the listing.
3. Run `npm run package`. In the dashboard choose **Add new item** and upload `store/package/call-recorder-<version>.zip`.
4. **Store listing:** copy the text from `store/listing.md` (name, summary, description, category, language). Upload `store/screenshots/*.png` (1280 x 800, up to 5) and `store/promo/small-tile-440x280.png`. The icon (128 x 128) comes from the package. A marquee image (1400 x 560) is optional.
5. **Privacy practices:** paste the single purpose and each permission justification from `store/permissions.md`, including the page scripts on `meet.google.com` and Konvene. Answer the data usage questions the same way, tick the certifications, and add the privacy policy URL.
6. **Test instructions:** paste the "Notes for the reviewer" section of `store/permissions.md`.
7. **Distribution:** choose public, unlisted or private, and the regions.
8. **Submit for review**, and choose whether to publish automatically once it is approved.

## What to expect

- Review usually takes from a few hours to a few days, and can take longer for extensions with sensitive permissions. `tabCapture`, the microphone and page scripts on named sites mean reviewers will read the permission justifications, so keep them accurate.
- Each update needs a higher `version` in `package.json`. Run `npm run package` again and upload the new zip.
- If a reviewer asks for a change, `npm run check` and `npm run smoke` tell you the extension still works before you resubmit.
- Do not add a permission without a written reason in `store/permissions.md`. `npm run validate` fails the build if you do.

## Make it easier to find

- Keep the listing name, summary and first lines of the description rich in what people search for: "Google Meet", "call recorder", "record calls", "no upload". `store/listing.md` has them.
- Ask early users for a review, and answer them. Ratings and reviews affect ranking in the store.
- Link the store page from the repository README and the landing page once it is live.
