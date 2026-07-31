# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a jewelry sales or sourcing professional building an outbound seller list. They understand lead quality through domain judgment but should not need to configure scoring equations or know which numeric weights are “correct.” They need to move quickly through many candidates, inspect the supporting evidence, and make the final Good, Maybe, or Not-fit decision.

## Product Purpose

Aurum automates discovery and prequalification of Canadian jewelry sellers through a primarily conversational interface. The user describes the target in ordinary language; Aurum converts that conversation into explicit saved criteria and scoring logic, finds companies, researches their catalogs and contact paths, recommends fit, shows its evidence, remembers prior searches and human feedback, and exports outreach-ready lead data.

Success means:

- a higher share of genuinely useful leads in the recommended set;
- very few clearly bad leads incorrectly presented as good fits;
- less repeated research and fewer duplicates across runs;
- enough evidence for a person to confirm or overturn each recommendation quickly;
- complete, practical contact data for outreach when it can be supported responsibly.

## Positioning

Aurum is not a generic chatbot that happens to search the web. Chat is the main control surface, while a persistent and inspectable sourcing system sits underneath it: structured criteria, a visible scoring equation, jewelry-specific qualification, candidate memory, deduplication, cited research, human review, evaluation against labeled examples, and structured exports.

Users should not need to invent or manually tune numeric weights. Aurum proposes and updates the equation from their language and accumulated feedback. The current criteria, weights, thresholds, and score breakdown remain available as an understandable explanation and advanced control—not as the primary workflow.

## Operating Context

The core workflow is:

1. Describe the desired and unwanted seller characteristics conversationally.
2. Review Aurum's structured understanding: must-have rules, preferences, exclusions, run scope, and scoring approach.
3. Discover sellers and skip companies already researched or imported.
4. Research location, catalog, inventory, pricing, seller type, contactability, social presence, and trade-show participation.
5. Review every candidate with its recommendation, score breakdown, reasoning, uncertainty, and source links visible.
6. Mark the candidate Good, Maybe, Not fit, or Already known.
7. Use those decisions as evidence for later runs and proposed scoring adjustments without turning one judgment into an unjustified hard rule.
8. Export the reviewed lead set to CSV or XLSX for sales workflows.

The current product is local-first: run history, candidate memory, imported leads, criteria chat, and human feedback are stored in the browser. Provider secrets remain server-side and are never stored in browser data or exports.

## Target Seller Profile

All accepted sellers must be located in Canada and must have an official website.

Strong product fit:

- 0.925 sterling silver chains;
- 10K to 14K gold chains;
- Cuban, paperclip, and regular chain styles;
- lower-priced jewelry, with representative product or order value below roughly CAD 70;
- substantial, credible, ready-to-ship inventory;
- products already in stock rather than made after ordering.

Seller priority:

1. wholesalers and manufacturers;
2. brands and boutiques;
3. retailers are acceptable when the product, price, stock, and contact requirements are strong.

Positive supporting signals:

- established selling presence on Instagram, Facebook, Etsy, Poshmark, Depop, Amazon, or similar channels;
- meaningful inventory depth and selling history;
- participation in exhibitions or trade shows;
- an identifiable owner, sales representative, or other relevant person;
- a relevant LinkedIn profile;
- a personal business email, published phone number, or another practical outreach path.

Hard or strong negative signals:

- seller is not verifiably located in Canada;
- diamonds, pendants, watches, vintage jewelry, or raw gemstones are a meaningful part of the candidate's relevant offering;
- products are handcrafted, personalized, made to order, or otherwise unavailable for prompt fulfillment;
- high-end or engagement-focused jewelry positioning;
- insufficient inventory or no evidence that products are currently in stock;
- no official website;
- no useful contact path.

## Capabilities and Constraints

- You.com performs web discovery and structured research.
- GPT-5.6 Luna translates conversational instructions into search criteria. Model recommendations must not be presented as verified facts.
- Qualification retains a deterministic, inspectable scoring equation. If model classification is introduced, it supplements rather than silently replaces the visible criteria and must be evaluated against labeled human decisions.
- The assistant may propose dynamic changes to weights or thresholds from explicit user instructions and repeated feedback, but changes must be summarized, saved, and reversible.
- Equations and advanced scoring controls remain available for transparency and differentiation, while sensible defaults and conversational editing prevent users from needing to configure them manually.
- The human makes the final lead decision.
- Runs must be cancellable and partial results must remain understandable and recoverable.
- Exhausted, cancelled, failed, active, and completed runs must be visibly distinct.
- Candidate and run memory must prevent avoidable duplicate research.
- Search sources and evidence URLs must be retained for traceability.
- Inferred personal emails are allowed only when clearly labeled as inferred, assigned an explicit confidence value, and never described as published or verified.
- The product should learn from repeated human feedback, but must not overfit a small evaluation set or silently create hard exclusions from a single decision.
- Open decision: “under CAD 70” currently means the affordable representative product/order range; the exact distinction between item price and average order value still needs validation.

## Export Requirements

Exports should support the following fields when evidence is available:

- person name;
- person role;
- company name;
- phone number;
- generic email;
- personal email;
- personal email status and confidence;
- country code (`CA`);
- record type (`outbound_seller`);
- lead status;
- lead source;
- seller type;
- main product segment;
- pricing tier;
- website URL;
- LinkedIn URL;
- Instagram URL and numeric follower count such as `16000`, never `16k`;
- Facebook, Etsy, Amazon, eBay, Poshmark, Depop, Pinterest, TikTok, and other relevant social URLs;
- description containing a real representative product-listing title for outreach personalization;
- model recommendation, human decision, confidence, reasons, evidence URLs, and research date.

## Brand Commitments

The product name is Aurum. Its voice is direct, practical, and evidence-first. It should explain recommendations in ordinary business language, avoid equations in the primary workflow, and never imply certainty the evidence does not support.

## Evidence on Hand

- An initial product run returned nine new leads. The user's gut check classified roughly three as very good, several as acceptable, and a couple as clear misses.
- A labeled starter evaluation set contains 25 companies: 10 Good, 2 Maybe, and 13 Bad.
- User-provided annotations identify recurring failure reasons including outside-Canada businesses, unsuitable retailers or marketplaces, high pricing, irrelevant catalog mix, and companies already known in the sales system.
- These examples are directional evidence, not a statistically sufficient claim of model accuracy.

## Product Principles

1. **Conversation on top, system underneath.** Chat makes the product approachable; explicit criteria, scoring, evidence, memory, and exports make it dependable and distinct.
2. **Evidence before recommendation.** Every fit judgment should be inspectable and source-backed.
3. **Human judgment is authoritative.** Automation narrows and explains; it does not make the final sales decision.
4. **Quality over target-count theater.** Returning fewer strong leads is better than filling a quota with obvious misses.
5. **Remember without overfitting.** Reuse prior research and repeated feedback while preserving uncertainty and reversibility.
6. **Outreach data must be honest.** Distinguish published, inferred, missing, and low-confidence contact details explicitly.

## Accessibility & Inclusion

The core sourcing and review workflow must work with keyboard navigation, visible focus, assistive-technology labels, non-color-only statuses, readable contrast, and clear recovery from errors or interrupted runs. No product-specific conformance target beyond this baseline has been confirmed.
