# agada

a browser-based tool to scan medicine strips and find cheaper generic alternatives in india.

try it: [agadahealth.vercel.app](https://agadahealth.vercel.app)

## why

local chemists in india charge massive brand markups. for example, a strip of branded pills can cost ₹180 when the exact same chemical formulation (same active salt, same strength) costs ₹30 under the government's pmbjp (jan aushadhi) scheme. 

the government publishes a registry of all generics, but nobody is going to copy-paste long chemical salt names while waiting in line at the pharmacy. agada lets you take a photo of the strip, extracts the text, and checks it against the registry to find the generic equivalent.

## how it works

- **local ocr**: uses tesseract compiled to webassembly. everything runs locally in the browser, so no medicine photos ever leave your phone.
- **fuzzy matching**: medicine labels are often bent or blurry. the app uses a phonetic matching worker (double metaphone + bm25) to map the blurry scans to actual registry names.
- **pharmacokinetics**: plots a basic concentration curve using the bateman equation in javascript.

## local development

```bash
npm install
npm run dev
```

opens on `localhost:5173`.
