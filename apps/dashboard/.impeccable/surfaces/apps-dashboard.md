---
version: 1
slug: "apps-dashboard"
primary_target: "apps/dashboard"
related_targets: ["apps/client","apps/platform-admin"]
---

# Surface brief: Client, Dashboard and Platform Admin

Scope: all three applications share one shadcn/ui + Tailwind component library (`@wlbp/ui-foundation`). Dashboard and Platform Admin are Operate surfaces; the Client home is Persuade, its booking flow Operate.

Audience: Gulf small-business owners, receptionists, staff and customers; Arabic-first, benchmarked against Salla/Zid. Default locale Arabic, default theme light with a dark toggle. Neutral generic demo template; every name, logo, text and option comes from the single `instance/` folder.

Constraints: tenant colours come from validated brand tokens; Noto Sans Arabic + Inter stay bundled; no custom component CSS, only Tailwind utilities and the shared token theme.

## Direction contract

THESIS: The working day is woven, not listed. The schedule reads as Sadu bands, one per staff member or resource, each booking a dyed segment. Refuses the category default of a grey card grid with a lone accent.

OWN-WORLD: Tenant primary as madder, a deep charcoal rail, one stepped neutral ramp, flat dyed fields, triangle-tooth band dividers only on timeline edges. Standard shadcn controls, 44px targets, logical RTL layout.

STORY: Staff open Today and see who is busy, what is next and what needs a decision. Owners trust that what they see is committed. Customers find a service and a time in three steps.

FIRST VIEWPORT: The start-side charcoal rail carries the logo and grouped nav. The top bar holds the dual Hijri/Gregorian date, live status and account. Today puts woven day bands (about 60% width) with a madder "now" thread beside a "needs decision" column of cards whose primary buttons sit at the card end.

FORM: Sadu Band, candidate 4 of 7 (Taqweem, prayer board, government e-services, Sadu, mashrabiya, souq signage, banknote); seed 27435e3f. Raises: stepped neutral ramp; fixed emphasis ramp; no card-in-card; reference codes as anchors; states stamp, never vanish.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
