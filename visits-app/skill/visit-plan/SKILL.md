---
name: "visit-plan"
description: "Build Ahmed's 2-week Dubai pharmacy/clinic visit plan (Nahdi, Medon, HealthHub, Med7, Aster) with 17 accounts per day and minimal driving, and his daily DSR report Excel. Use for خطة الزيارات, ريبورت/تقرير اليوم, DSR."
---

# خطة الزيارات (Visit Plan) + التقرير اليومي (DSR)

Build a 2-week field visit plan for a pharma sales rep in Dubai, and his daily report (DSR). Reply in Egyptian Arabic unless asked otherwise.

## Inputs
1. Ask the user to attach or paste his Google Maps saved lists (Nahdi list is "الأماكن المراد زيارتها"), or export them (Google Takeout CSV/KML) if not already provided.
2. If a list is missing (e.g. Med7, Medon, HealthHub, Aster branches), search the web / Places for exact Dubai locations and confirm with the user before using them.
3. Takeout CSV links carry no coordinates and Nahdi names are all the same — get the exact coordinates of every branch (resolve the Google Maps links) before routing. Never route on guessed locations without saying so.

## Rules
- Scope: **Dubai only**. No Sharjah, no Ajman. (The user can force-include a specific branch.)
- Working days: Mon–Fri, **17 accounts per day**, over **2 weeks**.
- Account counting:
  - Nahdi pharmacy = 1 account. **Every Nahdi must be visited every week** (top priority).
  - Medon pharmacy = 1 account. Cover all Medon branches within the plan.
  - HealthHub branch = 3 accounts (pharmacy + 2 doctors). Visit **only Thursday and Friday, 1–3 pm**. **Every Thursday and every Friday must include 3 HealthHub branches close to each other = 9 accounts.** Very important. **All 12 HealthHub branches must be covered in the 4 Thu/Fri days** — split them into 4 groups of 3 that are as close as possible (minimise the widest group).
  - Med7 pharmacy = 1 account; Med7 clinic = 2 accounts. **Exclude the Nasri (النصري) branch.**
  - Aster pharmacy = 1 account — used **only** to fill the day up to 17, or when it is on that day's route.
- Exclusions: all **Pharm C** pharmacies (use Medon instead); **Aster clinics**; Aster pharmacies located next to an Aster clinic.
- Priority order: **Nahdi → Medon → Med7 → the rest → Aster to fill**. Highest potentiality first; OTC pharmacies matter most.
- **Tight days:** each day stays inside **1 area, max 2–3 adjacent areas (مربعات)**. Never jump across Dubai (e.g. Al Warqa then Jumeirah is wrong). The main accounts of a day must be close to each other; if a Medon/Med7 branch is far from the day's area, leave it for the next cycle and put a nearby Aster in its place.

## Building the plan
1. Cluster all accounts by area (e.g. Deira, Bur Dubai, Al Barsha, JLT/Marina, Al Quoz, Mirdif, Silicon Oasis…).
2. Fix Thu/Fri first: the 4 HealthHub groups (all 12 branches), then 8 more accounts from the same area as each group.
3. Mon–Wed: one tight cluster of Nahdi per day, then Medon/Med7 inside that area; order stops to minimise driving.
4. Fill each day to exactly 17 accounts, using Aster last, chosen next to the day's main stops (not chained outward).
5. Check: every Nahdi appears in week 1 AND week 2; every Medon, HealthHub and Med7 (except Nasri) appears at least once (or is listed as "far — next cycle"); each Thu/Fri has exactly 9 HealthHub accounts at 1–3 pm; no excluded locations; no day spread over more than 3 adjacent areas.

## Plan output
- A **Sheets** artifact (if available), otherwise an .xlsx, with columns: Week, Day, Order, Account name, Chain, Type (pharmacy/clinic/doctor), Accounts count, Area, Time slot, Google Maps link.
- Daily totals row = 17. Offer a separate Excel per week.
- Short coverage summary in chat: counts per chain per week, and any account that couldn't fit.
- Offer a map of each day's route if asked.

## Daily report (DSR)
Every working day Ahmed sends a DSR Excel. After each visit he records who he met, the products discussed and a comment; build the file in exactly this layout:

- Sheet `DSR`, font Arial 11, left-to-right.
- Header block: `A1 Name:` / `B1 ahmed elmasry`, `A2 Country:` / `B2 U.A.E`, `A3 Date:` / `B3 <date, format mm-dd-yy>`, `A4 Location:` / `B4 Dubai`; row 5 empty.
- Row 6 table header (bold, grey fill #D3D3D3, centred, wrapped, thin borders, height 30):
  `#` | `Account Name` | `Doctor Name` | `Class` | `Specialty` | `Have Account` | `Remarks`
- One row per person met (height 45, thin borders, wrapped; `#`, Class and Have Account centred). At least 18 numbered rows (empty ones stay numbered).
- Column widths: A 4, B 32, C 22, D 8, E 18, F 12, G 65.
- A HealthHub visit = 3 rows (pharmacist + 2 doctors); a Med7 clinic = 2 doctor rows; a pharmacy = 1 pharmacist row. Non-account visits (e.g. "Bio pharma", Specialty "company", Remarks "Training") are allowed.
- Class: A / B / C. Specialty: pharmacist, Doctor, GP, Pediatrician, Gynecologist, … Have Account: Yes / No.
- Remarks style: `Introduced <p1>, <p2> and <p3>` and/or `Reminded with <p1> and <p2>`, followed by the comment. Products listed in the order discussed.
- File name: `Ahmed_DSR_DD_MM.xlsx` (report date).

### Products
Tussex, Resistin Plus, Prenausa, Coughnal, Kalmorex, Kinder immune, Neoidra, Hyalocid, Gynasept, Prebiotic, Pregnafort, Extra zinc, Extrafer, Extra cal, Extra Mag, Folicyo, Optinal PF, Hyalo atlantic, Bio D, Bio D max, D spray, Bio DK, Alphartor, Alphaton, DiaZn, Ringo.

## The app
Ahmed's Android app "خطة الزيارات" (repo `momoelmasry44-cpu/awesome-freellm-apis`, folder `visits-app/`) implements all of the above: plan generator, weekly Excel export, route maps and the DSR generator. Keep the app and this skill in sync when rules change.
