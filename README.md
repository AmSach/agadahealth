# agada (अगद)

a tool that scans your medicine strip and finds you cheaper generic alternatives.

**try it → [agadahealth.vercel.app](https://agadahealth.vercel.app)**

![screenshot](screenshot.png)

## why this exists

i got ripped off at a pharmacy. paid ₹380 for a strip of tablets when the exact same salt composition was available as a generic for ₹32. literally the same drug, same dosage, same everything - just without the fancy brand name printed on the box. that pissed me off enough to build something about it.

pharmaceutical companies in india charge 10x what the actual generic costs, and most people just... don't know. the information is technically public (the government has a whole database) but nobody's going to sit there and cross-reference salt names on a government website while standing at a chemist's counter.

so i built agada. you open it on your phone, point the camera at any medicine strip, and it tells you what you're actually paying for.

## what it does

- scans medicine strips/labels using your phone camera
- identifies the drug and checks it against the government's official CDSCO database
- shows the actual salt composition and what it does, in plain english
- finds cheaper generic equivalents (sometimes 90% cheaper, not exaggerating)
- tells you the prescription schedule (H, H1, X) so you know if you even need one
- works offline after first load - no internet needed at the pharmacy
- no login, no ads, no tracking

## the nerdy bits

**ocr runs entirely in your browser.** tesseract compiled to wasm, so nothing gets sent to a server. your medicine photos stay on your device.

**phonetic matching against CDSCO data.** medicine names on strips are messy - weird fonts, partial prints, smudged ink. i use a phonetic algorithm to fuzzy-match what the OCR reads against the actual drug database so it still works even when the scan isn't perfect.

**pharmacokinetics graph.** once you identify a drug, it plots a concentration-over-time curve using the bateman equation based on the drug's actual half-life and absorption rate. basically shows you how the drug moves through your body. thought it was cool so i added it.

**encrypted local cabinet.** you can save medicines locally in an encrypted store in your browser. nothing leaves your device.

**emergency qr codes.** generates a qr code with your saved medicines so if something happens, someone can scan it and see what you're on.

## run locally

```bash
npm install
npm run dev
```

that's it. opens on `localhost:5173`.

## credits

- drug data from [CDSCO](https://cdsco.gov.in) (central drugs standard control organisation)
- generic pricing from [BPPI Jan Aushadhi](http://janaushadhi.gov.in)
- built for [hack club stardance](https://stardance.hackclub.com)

**disclaimer:** i'm not a doctor. this is not medical advice. always talk to an actual medical professional before changing your medication. this tool just helps you ask better questions at the pharmacy.
