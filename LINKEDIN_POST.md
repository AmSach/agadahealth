---
title: "I Built the Only Free App That Actually Verifies Indian Medicines"
subtitle: "Agada — because the chemist is charging you 10x the real price and you don't even know it."
---

**The problem nobody talks about:**

Every second Indian has been overcharged at a pharmacy.

Not because the chemist is evil. Because *you* don't know what the generic costs. Or if that strip is even genuine. Or whether it's Schedule H (meaning you need a prescription, and the "pharmacist's recommendation" is actually illegal).

The information asymmetry is so bad that a strip of Crocin 500mg — ₹30 at MRP — is sold for ₹100 in many stores because most people just don't know any better.

I've been researching this for a while. The findings are worse than I thought:

• ~7% of drugs sold in India are counterfeit
• Jan Aushadhi Kendras exist since 2008 with medicines at 50-80% cheaper — but 90% of people don't know they exist
• AI hallucination on medicine info is a genuine safety risk — not just a "accuracy problem"

So I built something to fix it.

**Introducing Agada** (आगद = antidote/medicine)

It's a free, no-login app that:
📷 Scans any medicine strip in 3 seconds — even torn, blurry, handwritten labels
💊 Reads your doctor's prescription (including handwriting)
🔒 Tells you if it's genuine or likely fake
💸 Shows Jan Aushadhi alternatives with actual savings
⚕️ Flags whether you need a prescription (Schedule H/H1/X)

Try it: agadahealth.vercel.app

---

**What I learned building this (that I wish I knew starting out):**

1. The biggest UX problem isn't accuracy — it's **denial**. People don't want to believe the strip they have might be fake. You have to show, not tell.

2. AI hallucination on medicine prices is dangerous. I had to build strict guardrails — AI only returns a price if it's ±20% confident. Otherwise it says "not sure." That simple rule took me 3 days.

3. Government data is underrated. The entire Jan Aushadhi BPPI database is public. Nobody uses it. I'm embedding it and now 1000+ medicines have official reference prices.

4. Schedule H drugs get misclassified by AI 40% of the time. Alprazolam should be Rx, paracetamol should be OTC. I built an override map for 70+ commonly misclassified drugs.

5. levo-thyroxine ≠ thyroxine. These drug-prefix differences are ACTUALLY different drugs. Getting this wrong in a database lookup is dangerous. This alone took a week to get right.

---

**Tech stack:**
React + Vite frontend
Groq API (llama-4-scout for vision, llama-3.3-70b for text)
Jan Aushadhi BPPI + CDSCO public databases
DavaIndia live price API
Vercel deployment

No logins. No ads. No paywalls. Free forever.

If you know someone who takes regular medication — share this with them.

---

#India #Healthcare #Medicine #Startup #BuildInPublic #TechForGood

---

*Note: This is beta. Results should be verified with a pharmacist for critical decisions. No AI system is 100% — always trust your pharmacist for medicine-related decisions.*
