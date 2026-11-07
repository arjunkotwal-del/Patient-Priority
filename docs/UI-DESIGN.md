GATE: OPEN 29 (rounds used up)

# Frontend design review

Patient Priority is a hospital-oriented software interface. The main action is account access. The design uses the requested white primary surface, green for patient actions, blue for clinician access and information, and red for alerts. Existing CTAS colours and labels remain intact. System fonts keep the interface familiar and avoid remote font dependencies.

## Toronto hospital comparison

| Reference | Observed pattern | Applied here |
| --- | --- | --- |
| [UHN](https://www.uhn.ca/) | Patient and family resources are a primary destination. | Patient access and preparation steps are prominent. |
| [Sinai Health](https://www.sinaihealth.ca/) | Patient/visitor resources and staff links have distinct destinations. | Separate patient and clinician entry cards, with a shared sign-in provider. |
| [Michael Garron Hospital](https://www.tehn.ca/) | Direct task links for records, clinics, physicians, and visiting. | Plain task labels and direct account links rather than promotional feature claims. |

Reviewed November 7, 2026. These references informed the information hierarchy; their branding, images, and code were not copied. Toronto was used as the local area based on the project's Ontario health-card workflow and the session location context.

## Implementation

- Landing page: compact introduction, numbered patient journey, emergency notice, role-specific entry cards, and preparation information.
- Login page: existing login/signup actions and redirect destination preserved, with clearer context and account creation wording.
- Shared patient and clinician shells: white surfaces, green navigation, consistent controls, visible focus indicators, skip links, larger input targets, and responsive layouts.
- White is the default appearance; explicitly selected dark mode and large text preferences remain available.
- Copy is factual and task-based. No hospital affiliation, clinical statistics, testimonials, stock photographs, or invented patient data are introduced.
- The brief's simple hospital-use requirement takes precedence over the skill's full-screen sections, decorative moments, shader effects, and animation recipes. Only a short entrance and restrained interaction feedback are used, with reduced-motion support.

## Verification

- TypeScript and production build pass. Vite reports a JavaScript chunk above 500 kB.
- Landing and login pages checked in headless Edge at 320, 390, 768, 1024, and 1440 pixels: no horizontal overflow.
- Desktop landing, mobile landing, and desktop login screenshots inspected.
- Clinician entry reaches `/login` and preserves `/doctor` as the post-login destination.
- No authenticated account was used. Protected patient verification, reference, queue, and visit pages need a final authenticated visual check. Existing clinical reference placeholder content was not replaced with medical advice.
- Browser artifacts and detailed responsive results are in the ignored `.cache` directory.

## Design skill check report

The gate completed three rounds. There are no formal waivers. The remaining findings are retained and listed below rather than reported as a pass. The user's request for a simple hospital interface takes precedence over the skill's full-screen marketing sections, decorative visual moments, kit-specific DOM classes, and uniform heading sizes across cards and page sections.

Text contrast and keyboard focus findings from earlier rounds were corrected; neither appears in the final consistency findings. White is the default for new users; saved Light, Dark, System, and large-text preferences remain supported.

The checker uses the development server and could not inspect the full development React DOM dependency because its file exceeds the checker's 3 MB inspection limit. Dedicated performance checks were not run; production sizes are approximately 20 kB CSS and 542 kB JavaScript before gzip. No assets, domain, photography, stand-in contacts, or assumed clinical facts are required for this design.

### Open findings

- **hero-fill** (1440): main#main-content > div.emergency-notice.site-width "! Need emergency care? This website is n". the next section shows on the first screen: it starts at 771px on a 900px screen (the hero ends at 752px)
- **no-visual** (1440, 390): main#main-content > section.hero.site-width "Patient care, in one place.". no picture, effect or mock in this section; a feature section needs a visual
- **no-visual** (1440, 390): section#care-access "Access for every part of care.". no picture, effect or mock in this section; a feature section needs a visual
- **text-only** (1440, 390): section#how-it-works "Account access & preparation.". the closing section is only text: no picture, icon, mock or effect in it
- **cta** (1440, 390): section#how-it-works "Account access & preparation.". the last section before the footer ends with no button
- **heading-scale** (1440): h2#access-title "Access for every part of care.". h2 headings in 2 sizes, 24px ("Start with the essential") to 40px (x1.67)
- **hero-enter** (1440): main#main-content > section.hero.site-width. the hero does not enter on load: no data-enter on the hero and no head line setting html.m-enter (motion.md, The hero's entrance)
- **moment-none** (1440): (the page). a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)
- **hero-screen** (1440): main#main-content > section.hero.site-width "PATIENTS & CARE TEAMSPatient care,in one". the hero ends at 752px on a 900px screen, 149px above the fold: it ends at the fold, 1px either way (SR-1)
- **hero-screen** (1440): main#main-content > div.emergency-notice.site-width "!Need emergency care? This website is no". 149px of the next section shows on the first screen (from 752px on a 900px screen): nothing below the hero shows at load (SR-1)
- **section-height** (1440): main#main-content > div.emergency-notice.site-width "!Need emergency care? This website is no". the section is 58px tall (0.1 screens), 842px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)
- **section-height** (1440): div#root > div.landing > footer.footer.site-width "Patient PriorityPatient information. Car". the section is 93px tall (0.1 screens), 807px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)
- **section-height** (1440): section#how-it-works "BEFORE YOU BEGINAccount access & prepara". the section is 431px tall (0.5 screens), 469px short of one screen (900px): every section after the hero is one screen or two, 2px either way (and 1 more like it: "THE RIGHT PLACE TO START") (SR-2)
- **section-air** (1440): main#main-content > div.emergency-notice.site-width "!Need emergency care? This website is no". the content fills 31% of the section's height (18 of 58px): 55% or more (40% WARN) (SR-3)
- **one-section** (1440): h2#how-title "Account access & preparation.". the screen at scroll 900px (stride 1) shows 431px of section 4 and the heading of section 4 whole and the content of 2 sections, over 24px each beside section 3: a screen shows one section (another may peek 8px, 24px WARN) (SR-4)
- **one-section** (1440): section#care-access "THE RIGHT PLACE TO STARTAccess for every". the screen at scroll 970px (the top of section 4) shows 375px of section 3 and the content of 3 sections, over 24px each beside section 4: a screen shows one section (another may peek 8px, 24px WARN) (SR-4)
- **one-section** (1440): main#main-content > div.emergency-notice.site-width "!Need emergency care? This website is no". a <div> sits directly in <main>: every part of <main> is a <section> (SR-4)
- **one-heading** (1440): main#main-content > section.hero.site-width > div.care-guide > h2 "Start with the essentials.". the hero holds an h2 (1): its heading is the h1, and an h2 opens the next section (SR-5)
- **one-heading** (1440): h2#access-title "Access for every part of care.". headings of two sections show whole on one screen at 10 of 20 scroll positions (50%; at scroll 100, 150, 200, 250px), here with "Start with the essentials.": at most 3% on a desktop (SR-5)
- **container-edges** (1440): main#main-content > div.emergency-notice.site-width "!Need emergency care? This website is no". the content of section 2 runs 187px from the left and 369px from the right (read from its outermost blocks: no .wrap): the page's container starts at 120px; 187 and 369px are not one margin; the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)
- **container-edges** (1440): div#root > div.landing > header.topbar.public-header "Skip to content+Patient PriorityHow it w". the nav's content runs 16px from the left and 120px from the right (read from its outermost blocks: no .wrap): the page's container starts at 120px; 16 and 120px are not one margin; the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)
- **container-edges** (1440): div#root "Patient information & clinical care Pati". a <div> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)
- **container-edges** (1440): main#main-content > section.hero.site-width "PATIENTS & CARE TEAMSPatient care,in one". the section needs exactly one in-flow child .wrap (it has 2 in-flow children, 0 .wrap) (and 4 more like it: "!Need emergency care? Th", "THE RIGHT PLACE TO START", "BEFORE YOU BEGINAccount ") (SR-6)
- **container-edges** (1440): div#root > div.landing > header.topbar.public-header > a.skip-link "Skip to content". a box runs 16-163px, outside the container lines of the nav at 120-1320px: full width is for background layers and grounds only (SR-6)
- **container-edges** (1440): main#main-content > section.hero.site-width > div.care-guide > h2 "Start with the essentials.". the h2 starts 700px right of the container's left: every h1 and h2 starts on it, 2px either way (SR-6)
- **container-edges** (1440): div.site-width.how-layout > div.info-list > div:nth-of-type(1) > h3 "One account to get started". 2 text blocks start on a left line at x 721, 601px from the container's left: text starts on the container's left, or on one split line (x 630, 732, 834) (also "New here? Choose “Create an acco") (SR-6)
- **split-pair** (1440): section#how-it-works > div.site-width.how-layout "BEFORE YOU BEGINAccount access & prepara". the split's columns are off the page's one pair of lines: its right column starts at x 721, on none of the split lines 630 (k=5), 732 (k=6), 834 (k=7) (SR-8)
- **heading-scale** (390): section#care-access > div.access-grid > a.access-card.patient-access > h3 "Your patient account ↗". h3 headings in 3 sizes, 15.2px ("Access your account") to 20px (x1.32)
- **container** (1440, 390): page. no .wrap

### Retained warnings

- **flush** (1440): main#main-content > div.emergency-notice.site-width > span.notice-icon. its last line sits 20px above the rule on top of section#care-access
- **nav** (1440): div#root > div.landing > header.topbar.public-header > a.brand. the nav is lopsided: its first item starts 7px inside the content's edge (120px), while its last ends on the other edge
- **copy-headings** (1440): div.site-width.how-layout > div.info-list > div:nth-of-type(3) > h3. "Text size and appearance" names no product, part, place or section (the one brand line a page may have)
- **copy-buttons** (1440): main#main-content > section.hero.site-width > div.hero-copy > a.btn.btn-lg. "Access your account →" does not start with a verb (book, buy, try, start, get, see...)
- **copy-actions** (1440): div#root > div.landing > header.topbar.public-header > a.btn.btn-ghost. 2 labels for one target /login: "Log in ↗", "Access your account →"
- **copy-actions** (1440): (the page). the main action "Log in" does not read word for word the same in the closing section
- **body-size** (1440): main#main-content > div.emergency-notice.site-width > p. 4 of 5 paragraphs of running text are set under 16px (13.6, 14.4px)
- **section-gaps** (1440): section#care-access / section#how-it-works. 144px between these sections, +41% against the median 102px
- **nav-labels** (1440): div#root > div.landing > header.topbar.public-header > a.skip-link. "Skip to content" opens a section headed "Patient care, in one place."
- **nav-labels** (1440): div.landing > header.topbar.public-header > nav > a:nth-of-type(1). "How it works" opens a section headed "Account access & preparation."
- **one-screen** (1440): section#care-access. 1 section is shorter than the screen, so the next one's heading or picture shows with it: "Access for every part of care." is 536px of the 811px under the nav, and "Account access & preparation." shows below it
- **hero-enter** (1440): main#main-content > section.hero.site-width. the hero does not enter on load: no data-enter on the hero and no head line setting html.m-enter (motion.md, The hero's entrance)
- **moment-none** (1440): (the page). a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)
- **share-meta** (1440): head. the head lacks og:title, og:description, og:image, twitter:card, an icon, theme-color: a shared link shows no picture or title of its own
- **section-air** (1440): main#main-content > div.emergency-notice.site-width / section#care-access. 102px of air between the content of these two sections: 128-480px (64-600px WARN) (SR-3)
- **flush** (390): main#main-content > div.emergency-notice.site-width > p. its last line sits 19px above the rule on top of section#care-access
- **nav** (390): div#root > div.landing > header.topbar.public-header > a.brand. the nav is lopsided: its first item starts 6px inside the content's edge (20px), while its last ends on the other edge
- **tap-size** (390): div#root > div.landing > header.topbar.public-header > a.brand. a 143x30px tap target: under the 44px a phone needs
- **tap-size** (390): section.hero.site-width > div.care-guide > div.guide-footer > a. a 308x19px tap target: under the 44px a phone needs
- **tap-size** (390): div#root > div.landing > footer.footer.site-width > a.brand. a 350x29px tap target: under the 44px a phone needs
- **heading-scale** (390): h2#access-title. h2 headings in 2 sizes, 24px ("Start with the essential") to 28.8px (x1.20)
- **section-gaps** (390): section#care-access / section#how-it-works. 90px between these sections, +30% against the median 69px

Warnings are kept visible for review. They include the same compact-layout and kit conventions noted above, action/copy heuristics, and missing social-sharing metadata. No medical claims or hospital affiliations are inferred from the references.
