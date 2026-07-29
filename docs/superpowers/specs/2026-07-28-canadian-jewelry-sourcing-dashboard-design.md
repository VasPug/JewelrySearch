# Canadian Jewelry Sourcing Dashboard Design

## Purpose

Build a single-user web dashboard that automatically discovers, qualifies, enriches, scores, and exports Canadian jewelry sellers. The user configures a run, starts it manually, and downloads a CSV containing up to 100 new qualified sellers. There is no human review stage and no outreach automation.

The system uses You.com as its only paid research service. An AI model may extract structured facts from research results, but application code—not the model—calculates confidence scores.

## Target Sellers

Eligible businesses must:

- Be physically located in Canada.
- Sell jewelry through a website.
- Carry affordable, ready-to-ship jewelry made from 0.925 sterling silver, 10K–14K gold, gold-filled material, or gold-plated material.
- Have a public email address or phone number.
- Have meaningful existing inventory.

Chains—including Cuban, Figaro, box, paperclip, twisted, and regular chains—are especially valuable but are not mandatory. Other qualifying products include bracelets, earrings, rings, anklets, and similar jewelry.

Seller priority is:

1. Manufacturers
2. Wholesalers
3. Retailers
4. Brands and boutiques
5. Marketplace-only or social sellers

Trade-show or exhibition participation is a positive signal. Existing Instagram, Facebook, Etsy, Amazon, Pinterest, Poshmark, Depop, eBay, or TikTok selling activity is useful but not mandatory.

## Permanent Canadian Location Gate

Canadian location is a permanent system rule and does not appear in user preferences.

A candidate passes only when the system finds:

- A Canadian headquarters, store, office, warehouse, or manufacturing address on the official website; or
- Two independent credible sources that agree on a Canadian physical business location.

Shipping to Canada, Canadian-dollar pricing, a `.ca` domain, or an unsupported mention of Canada is insufficient.

If location is not Canadian or cannot be verified, the candidate receives a score of zero and is rejected.

## Product Exclusions

Reject a seller when any of the following is its main business:

- Handmade or made-to-order jewelry
- Personalized jewelry
- Permanent jewelry
- Vintage jewelry
- Costume jewelry
- Raw gemstones
- Engagement jewelry
- High-end jewelry
- Diamonds, watches, pendants, moissanite, or cubic zirconia

Unwanted categories may be acceptable as secondary inventory:

- A secondary category with a sampled median price of CAD $30 or less receives no penalty.
- A sampled median price from CAD $31–$60 subtracts 5 points.
- A sampled median price from CAD $61–$70 subtracts 10 points.
- Diamond or other unwanted inventory above CAD $70 causes rejection when meaningfully represented.
- Moissanite or cubic-zirconia inventory above CAD $60 causes rejection when meaningfully represented.

“Meaningfully represented” means at least 10% of the sampled catalog or at least five sampled listings. A single unrelated listing does not disqualify an otherwise suitable seller.

## User Experience

### Dashboard

The home screen shows:

- A button to configure and start a run
- The active run’s stage and progress
- Candidates discovered, researched, qualified, rejected, and deduplicated
- You.com usage and research-limit status
- Previous runs with configuration, outcome, and CSV download

Runs are launched manually. The application does not schedule runs.

### Run Preferences

Preferences include:

- Qualification threshold, default 75
- Target qualified leads, default 100
- Positive scoring weights
- Seller-type priority values
- Preferred and rejected price tiers
- Unwanted-product penalties
- The percentage and count that make an unwanted category meaningful
- Accepted metals
- Accepted jewelry categories
- Required and optional contact fields
- Research/search budget

Positive weights must total 100. The interface displays the live equation, validates the configuration, provides recommended defaults, and can restore those defaults. The latest valid configuration is saved for the next run.

Canadian location is not configurable.

## Research Pipeline

Each run proceeds through these stages:

1. **Discovery:** Query You.com using several search families covering Canadian manufacturers, wholesalers, retailers, trade-show exhibitors, marketplace sellers, and social sellers. Discover substantially more than 100 candidates.
2. **Canonicalization:** Normalize company names, domains, phone numbers, and social handles.
3. **Location verification:** Apply the permanent Canadian location gate before expensive enrichment.
4. **Website and catalog research:** Inspect the official website and a representative sample of up to 20 qualifying product listings. Extract product types, metals, prices, stock state, customization state, and product focus.
5. **Contact enrichment:** Inspect contact, about, and team information and supporting search results. Extract owner or relevant sales/marketing personnel, roles, phone numbers, generic emails, published personal emails, LinkedIn pages, and social profiles.
6. **Email inference:** Infer a likely personal work email only when a company domain and defensible public email pattern exist. Mark it as inferred and unverified.
7. **Rule evaluation:** Apply hard gates and exclusion rules.
8. **Scoring:** Calculate the deterministic score in application code from extracted evidence.
9. **Deduplication:** Deduplicate against the current run and all prior accepted results.
10. **Continuation:** Continue discovery until the target number of passing sellers is reached or the configured research budget is exhausted.
11. **Export:** Store the run and create a downloadable CSV.

Every material extracted fact must retain its source URL. Missing information earns no points and remains blank; the system does not invent values.

## Deterministic Confidence Score

The confidence score is:

```text
confidence = L_canada × max(0, P + A + I + S + K + R - U)
```

`L_canada` is 1 only for a verified Canadian physical location and 0 otherwise.

Recommended default weights:

| Component | Maximum | Meaning |
|---|---:|---|
| P | 30 | Product and material fit |
| A | 20 | Affordability |
| I | 18 | Inventory depth and ready-to-ship evidence |
| S | 12 | Seller-type priority |
| K | 12 | Contactability |
| R | 8 | Online selling history and trade-show evidence |
| U | 20 penalty | Unwanted secondary inventory |

The positive component maximums must total 100. All weights and penalty values are editable in the run preferences.

### Affordability

Sample up to 20 qualifying listings, normalize prices to Canadian dollars, and assign each listing to a configured price tier. With the recommended tiers:

```text
A = A_max × (
  0.50 × p_10_25 +
  0.30 × p_26_50 +
  0.15 × p_51_70 +
  0.05 × p_71_100
)
```

Each `p` is the proportion of sampled qualifying products in that price tier. Products above CAD $100 contribute zero. When no defensible price sample is available, affordability earns zero.

### Contactability

The recommended contact scale, normalized to the configured `K` maximum, is:

- Published personal work email for a named relevant person: full credit
- Inferred personal work email with a defensible pattern: 70% credit
- Generic company email: 50% credit
- Phone only: 40% credit
- No email or phone: hard rejection

Relevant people are owners, founders, sales leaders, marketing leaders, directors, or other roles plausibly responsible for purchasing or partnerships. CEO details are acceptable when no closer role is available.

### Qualification

A candidate is exported only when:

- Every hard gate passes; and
- Its calculated score is greater than or equal to the configured threshold.

The default threshold is 75.

## CSV Schema

The export contains:

| Column | Description |
|---|---|
| `person_name` | Best relevant public contact |
| `person_role` | Contact’s role |
| `company_name` | Seller name |
| `phone_number` | Public business phone |
| `generic_email` | Published general company email |
| `personal_email` | Published or inferred work email |
| `personal_email_status` | `published`, `inferred`, or blank |
| `personal_email_confidence` | Numeric inference confidence or blank |
| `country_code` | Always `CA` |
| `record_type` | Default `outbound_seller` |
| `lead_status` | Default `unqualified` |
| `lead_source` | Where the candidate was discovered |
| `seller_type` | Manufacturer, wholesaler, retailer, brand/boutique, or marketplace/social seller |
| `main_product_segment` | Main qualifying jewelry segment |
| `pricing_tier` | Best-supported configured price tier |
| `website_url` | Official website |
| `linkedin_url` | Relevant person or company LinkedIn |
| `instagram_url` | Instagram profile |
| `instagram_followers` | Digits only, such as `16000` |
| `facebook_url` | Facebook profile |
| `etsy_url` | Etsy shop |
| `amazon_url` | Amazon seller/store |
| `ebay_url` | eBay seller/store |
| `poshmark_url` | Poshmark profile |
| `depop_url` | Depop shop |
| `pinterest_url` | Pinterest profile |
| `tiktok_url` | TikTok profile |
| `other_social_urls` | Other discovered sales/social links |
| `description` | Exact title of one relevant qualifying product listing |
| `confidence_score` | Deterministically calculated score |
| `score_breakdown` | Compact component and penalty values |
| `evidence_urls` | Supporting source URLs |
| `date_researched` | Research completion date |

Missing values remain blank. Follower counts must contain digits only, with no commas, decimal points, or abbreviations.

## System Components

The implementation will keep clear boundaries between:

- Web dashboard and run preferences
- Run orchestration and progress reporting
- You.com search client
- Evidence extraction
- Location verification
- Catalog classification and price sampling
- Contact and social enrichment
- Deterministic rule engine and scorer
- Deduplication
- Persistence
- CSV export

Structured inputs and outputs will separate research/extraction from scoring. This allows scoring rules to be tested without network calls and research providers to be changed without rewriting qualification logic.

## Error Handling

- Retry temporary You.com failures with capped exponential backoff.
- Record per-candidate failures and continue the run.
- Stop cleanly when the configured research limit is reached.
- Never export a partially researched candidate as qualified.
- Surface terminal run failures and resumable interrupted runs in the dashboard.
- Preserve evidence and rejection reasons for diagnostics.
- Validate CSV fields to prevent spreadsheet formula injection.
- Keep API keys server-side and out of logs, browser responses, and exports.

## Testing and Acceptance

Automated tests will cover:

- Canadian location gate
- Every hard rejection rule
- Configurable score calculations and weight validation
- Price-tier boundaries
- “Meaningfully represented” unwanted-category boundaries
- Contactability scoring and inferred-email labeling
- Domain/name/phone/social deduplication
- Instagram follower normalization
- CSV escaping, schema, and spreadsheet-injection protection
- Run continuation and research-budget exhaustion
- Provider failures, retries, and partial candidate failures

Integration tests will use recorded provider fixtures so routine tests do not spend You.com credits.

The first version is acceptable when a user can configure and start a manual run, observe progress, obtain up to 100 new sellers that pass the permanent and configurable rules, reproduce each score from stored evidence, and download a valid CSV with the agreed columns.

## Out of Scope

- Sending email, calls, or social outreach
- Scheduled runs
- Multiple users or organizations
- Google Sheets synchronization
- CRM synchronization
- Email verification through Hunter.io or another paid enrichment service
- Human approval of individual leads
