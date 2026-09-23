# Obscured coordinates

How OBP-Server handles observations whose location iNaturalist hides, what happens to records already stored when we pull, and how those records reach Beeline at cutover. This is the one place the rule lives; the pull requests and issues it cites are history, and where they disagree with this page, this page is current.

Written 2026-09-22 for the engineers on both systems. It records the state of production on that date. Measurements go stale; the method for repeating them is at the end of [Measuring the stored population](#measuring-the-stored-population).

## What iNaturalist does

Everything below is from iNaturalist's source ([`app/models/observation.rb`](https://github.com/inaturalist/inaturalist/blob/main/app/models/observation.rb), read at commit `f12c7b4`, March 2025) and from probing the API with the project's own tokens.

- **Two settings hide a location.** `geoprivacy` is set by the observer. `taxon_geoprivacy` is applied by iNaturalist from the taxon's conservation status, and no observer setting removes it. Each is `obscured`, `private`, or open. For us the two behave identically: what decides everything is whether the true point is granted to our token, not whose privacy hid it.
- **An obscured observation publishes a stand-in, not a coarser point.** The public `geojson` is a point drawn uniformly at random inside the fixed 0.2° grid cell that contains the true point (`COORDINATE_UNCERTAINTY_CELL_SIZE`, `random_neighbor_lat_lon`). At Oregon's latitude that cell is about 22 km by 16 km, so the stand-in can be up to about 27 km from the true point. It is a different place, and once stored it looks exactly like a real coordinate.
- **The stand-in is redrawn only when the true coordinates are edited**, or when the setting moves from private to obscured (`obscure_coordinates`). Otherwise it stays fixed. So an observation can have published several stand-ins over its life, all inside the same cell, and the API only ever returns the current one. A stored pair that is not the current stand-in is not thereby true.
- **A private observation publishes no point at all.**
- **`positional_accuracy` describes the true point** even on an obscured record; the inflated figure is `public_positional_accuracy`. A stand-in stored with the observation's accuracy therefore looks as precise as any other record.
- **The true point arrives as `private_geojson`**, with `private_place_guess` and `private_place_ids` beside it, and only when the token is entitled to it. For this project that entitlement is the project-curator path: the observer's membership in the source project allows curators to see coordinates, and the token belongs to a curator or manager of that project. It is per observer and per project, and observers can change it.
- **`viewer_trusted_by_observer` is a trap.** It reports personal trust between two accounts and is `false` on every observation we receive through the curator path. Presence of `private_geojson` is the only test.
- **Taxon obscuring does not put coordinates out of reach.** Production's curator token receives the true point for 867 of the 880 obscured observations in the three source projects (measured 2026-09-22). The 13 it does not get are all taxon-obscured and all in project 18521, and Beeline's token sees the same 13 or 14, so they are the observers' own settings rather than a role gap.
- **A token that is not a curator gets the anonymous projection, silently.** No error, no missing field, just no `private_*` fields. Production authenticated as a non-curator account until 13 September 2026 and every private coordinate was quietly absent.

## The rule

**An occurrence holds the true location or none at all.** Where the true point was withheld, we record no coordinates, no locality and no place IDs, and the record cannot be labelled until access is granted. Decided by Peter on PR #59 ("we always want true coordinates and only true coordinates is the point"), confirmed for new records by Arthur on 21 September 2026.

| Observation | Access granted | Stored location | Label |
| --- | --- | --- | --- |
| Obscured or private, either setting | yes | true point, its own locality and place IDs | prints |
| Obscured or private, either setting | no | none | blocked |
| Not obscured | n/a | public point | prints |

What each stored field means:

- `geoprivacy` and `taxon_geoprivacy` are copied from the observation when the occurrence is created and on every refresh, with `open` stored as empty. They describe the observation as of the last time we looked at it, which for most stored records is a long time ago (see [Stored records](#stored-records-do-not-fix-themselves)).
- `coordinateSource` says which point the coordinates came from: `private` (the true point, under a grant), `public` (the point iNaturalist publishes, which for an unobscured record is also the true one), or empty (no coordinates). It is absent on every record stored before 13 September 2026 and on any record uploaded from a CSV that lacks it.
- The `geoprivacy` error flag means the true location was withheld from us. It is a fault: it keeps the record from being given a field number, and it feeds the emails subtask's list of observers to ask for access.
- The `taxon_geoprivacy` error flag is a marker, not a fault. It is raised whenever the observation carries taxon geoprivacy, whether or not we hold the true point, because it marks a record whose location must be coarsened by whoever exports it onward. Marker flags do not block a field number, the occurrences file, or a label ([`markerFields`](../shared/lib/utils/constants.ts)).

The label gate ([`isPrintable`](../shared/lib/services/OccurrenceService.js)) asks two things: every label field is present and unflagged, and the location is known to be true, meaning nothing obscured the record or `coordinateSource` is `private`. The second test exists for stored records: a stand-in stored years ago has every label field filled and passes the first test.

Access moves both ways, and the two directions are not symmetric:

- **Gaining access rewrites the location** to the true point. The locality follows unless the point did not actually move, which is the usual case for a record built while its observation was still open.
- **Losing access rewrites nothing.** A true point recorded while we were entitled to it stays: the bee was caught where it was caught, the label already says so, and deleting the coordinates unsays nothing. What the observer's change governs is what we publish, so the record keeps its `geoprivacy` value and is coarsened on the way out, like a taxon-obscured record. Decided by Peter on 22 September 2026; it reverses PR #54, which cleared the coordinates.

Coarsening sensitive locations for export to GBIF and similar is taxonomists' work, done from the `taxon_geoprivacy` flag. The server does not degrade its own data to achieve it. Two consequences are still open: the occurrences CSV can be downloaded without a login ([#58](https://github.com/oregon-bee-project/OBP-Server/issues/58)), and nothing warns when a curator token silently loses access ([#56](https://github.com/oregon-bee-project/OBP-Server/issues/56)).

Production must authenticate to iNaturalist as a curator of all three source projects. It does so as Andony's account since 13 September 2026, when Nora re-linked it. Check with `/v1/users/me` using the token the system actually uses, not a developer's.

## What a pull does

There are two subtasks that touch coordinates, and they reach different records.

**The observations subtask** pulls observations from the source projects within a date window, builds an occurrence per specimen in scratch space, gives a field number to every occurrence with no fault flag, and at the end of the run keeps only the occurrences that were numbered or carry no flag at all. Everything else is discarded.

For a new obscured observation without access this means: empty coordinates, locality and place IDs; a fault flag on each of those and a `geoprivacy` flag; no field number; discarded. The observer appears in the emails file. The record is not remembered. It re-enters only if a later pull's date window covers it again, after access has been granted. Two things follow:

- Production holds no obscured record with `coordinateSource: 'public'`, although the code was for a while willing to write one. The population of stored stand-ins is frozen and can only shrink.
- Volunteers who never grant access are pulled, flagged and dropped on every pull that covers their dates. That is by design, and the emails subtask is how they find out.

**The occurrences subtask** takes existing records, either a selection or an uploaded CSV, moves them into scratch space, and refreshes each from its observation ([`updateOccurrenceFromObservation`](../shared/lib/services/OccurrenceService.js)). A refresh always rewrites the two privacy fields, the plant taxonomy and the elevation. It rewrites the location only when access changed, as described above, or when the task was run with "overwrite valid locations", and even then only to a true location: an observation with nothing to offer leaves the stored point alone. It never rewrites `country`, `stateProvince` or `county`.

### Stored records do not fix themselves

This is the fact we got wrong most often, so it gets its own heading.

- A refresh reaches only the occurrences a task selects. Nothing walks the whole collection.
- A record stored before `coordinateSource` existed has no provenance, so a refresh cannot tell its stand-in from a true point. It is rewritten only if access has since been gained, in which case the true point replaces whatever was there.
- The privacy fields on a stored record are only as fresh as its last refresh. On 16 August 2026 no stored occurrence carried a value; on 22 September 4,276 did. So `geoprivacy` and `taxon_geoprivacy` in the database cannot be used to find the obscured population; they see about a fifth of it. Start from iNaturalist's list instead.
- The label gate can therefore only see a stand-in whose record has been refreshed. Every stand-in in production today is already printed, so this matters only for reprints.
- Country, state and county are never corrected by any pull. Where a stand-in put a record in the wrong county, only a one-off cleanup fixes it.

No cleanup of stored stand-ins is scheduled. OBP-Server is superseded by Beeline at cutover, and the cleanup would be a one-off pass on the Mongo store; it may never run. The Beeline import must not assume it did.

### Measuring the stored population

Measured 2026-09-22 on production, and again on 2026-09-23 with the committed script with identical results, using production's own curator token and starting from iNaturalist's list of currently obscured observations in projects 18521, 99706 and 166376:

| | count |
| --- | --- |
| obscured observations in the three projects | 880 |
| of which the token receives a private point | 867 |
| matched to at least one occurrence | 713 |
| specimens on those observations | 4,132 |

Each specimen's stored pair against the observation:

| verdict | specimens | of which printed |
| --- | --- | --- |
| equals the current stand-in | 122 | 122 |
| 5 km or more from the true point (an older stand-in) | 149 | 149 |
| within 100 m of the true point | 3,817 | 3,632 |
| between 100 m and 5 km | 4 | 4 |
| no private point to compare against | 40 | 40 |

**271 specimens from 57 observations hold a stand-in, and all 271 are on printed labels**, dated between 31 December 2019 and 13 May 2026. One example: field number OBA_2125556, printed 31 December 2021, label reads "Christmas Valley, 43.3780 -120.2870". That pair is the point iNaturalist publishes today for its observation, not the collection site. The older stand-ins miss the true point by about 11 km on average, and they sit in the same 0.2° cell as the true point, which is what a previous random draw from the cell looks like and what a moved pin does not. Stored pairs are rounded to four decimals, so one can land exactly on a cell edge; the script allows for that.

How the verdict is reached, in order: no stored coordinates; equals the current public point to four decimals; no private point available; else by distance to the private point. The distance test comes before the same-cell test because a true point is trivially in its own cell.

The measurement is [`scripts/audit-obscured-coordinates.mjs`](../scripts/audit-obscured-coordinates.mjs). It runs inside the worker container, reads nothing but the API and the occurrences collection, prints the tables above as JSON, and writes the list of stand-in specimens (field number, print date, what the label says, distance, observation) to `audit-wrong-points.csv` for whoever decides about the pins. Run it again whenever the number matters, in particular on the day the cutover dump is taken: the count drifts down as observers grant access and a task selects their records, and it never goes up.

### Labels already printed

What to do about the 271 pinned labels is Arthur's decision, and it is open with him. The two options: correct the 271 records, leaving those pins deliberately wrong and the record right; or leave the records matching their pins. Beeline is built to hold only coordinates it believes true, so the decision is about the pins, not about the new system. His earlier suggestion of a note on each changed record, and his answers about a CSV column, were given before we knew the population; the column will not be added here, and the note belongs in Beeline if anywhere.

Separately, before the label gate existed (PR #52, 30 August 2026) obscured records were not kept off labels at all, and before 13 September no private point was ever stored, so every true point on an obscured record was captured while the observation was still open. The 271 are the whole of that exposure as of 22 September; the 40 with no private point cannot be settled either way until their observers grant access.

## Handing the records to Beeline

Beeline imports OBP-Server's `occurrences` collection with `mongoexport`, every field, staged verbatim and then promoted into its own model. The dump is re-fetched at cutover (Peter, 2026-09-22), so what the import faces is production as it stands that day, not any earlier staging. Tracked in Beeline's beads workspace as beeline-b34, "Legacy import would land ~271 stand-in coordinates as believed-true; re-measure at cutover" ([rainhead/beeline](https://github.com/rainhead/beeline); the beads are local to a checkout, run `bd show beeline-b34` there).

Beeline's rule is the same as this one, enforced differently:

- `sample_location` holds believed-true coordinates only, with a per-row `source` (`inat_trusted`, `inat_public`, `legacy_import`, `staff_entry`). Promotion from a synced observation writes the private pair when it has one, the public pair only when nothing obscured the observation, and nothing at all otherwise. Stand-ins never enter the sample layer.
- An obscured sample with no location row gets the blocking finding `obscured_no_true_coordinates` and cannot print.
- Both pairs are retained in the main store, in `observation_load` and `observation_field`, under ADR 0003: true coordinates protect plants, not participants, and anyone trusted with the main store is trusted with them. Whether an atlas may reveal a taxon-obscured true point downstream, on a label or in an upload to GBIF or Ecdysis, is per atlas, open, and a go-live blocker; nothing on this page changes it.

What the import does today, and why it is wrong for these records:

- Every legacy pair lands as `source = 'legacy_import'`, believed true. The staged columns include `geoprivacy` and `taxon_geoprivacy` but promotion never reads them, and `coordinateSource` is not staged at all (it is missing from the column list in `src/load-legacy.ts`). Three places in Beeline still say production has no coordinate provenance: `schema/030_samples_specimens.sql`, `ingest/promote-legacy.sql`, and `docs/reference-implementation.md`. That was true on 20 August and is not now.
- Since Beeline PR #74, every legacy sample counts as printed, and promotion never rewrites a printed sample's coordinates. So "the sync can upgrade legacy coordinates later" no longer holds: a stand-in imported as believed-true stays for good, even where Beeline holds the true point.
- The QC rule does not fire, because these samples have a location row.

What OBP-Server can and cannot tell the import per record:

| stored field | what it tells the import |
| --- | --- |
| `coordinateSource: 'private'` | the pair is true; 2,346 records on 2026-09-22 |
| `coordinateSource: 'public'` | the pair is a stand-in; production holds none |
| `coordinateSource` absent | unknown provenance; this is where all 271 are |
| `geoprivacy`, `taxon_geoprivacy` | only meaningful on records refreshed since the privacy refresh shipped; empty says nothing |

So the OBP-Server fields cannot identify the stand-ins. The import has to decide from Beeline's own trusted sync, which is the same test the audit script runs: a legacy pair that equals the current public point, or lies 5 km or more from the private point and in its 0.2° cell, is a stand-in; within 100 m is true; the rest are ambiguous or unresolvable. What to do with a pair judged a stand-in is not decided. Withholding it leaves the sample with no location row, which the promotion's insert path fills with the true point on the next run, unguarded by the printed lock, giving a right record under a wrong pin. Keeping it preserves the pin and stores a known falsehood as believed-true. That is the same decision as [Labels already printed](#labels-already-printed) and it is Arthur's.

Two things about Beeline's own access:

- Beeline syncs as Peter's account, which manages 18521 and 166376 but has no role in 99706. Every obscured observation it has only through 99706 lacks its private point on the local store (163 observations). Peter asked Andony for the manager role on 2026-09-22; after it is granted, a full re-sync of 99706 is needed, because the nightly incremental sync will not refetch old observations.
- After that, the unresolvable floor is the 13 or 14 taxon-obscured observations in 18521 whose observers' trust settings withhold the point from every manager. Those are the ones the QC rule should hold for good.

## Mistakes, and what they teach

The record of this work is four PRs and a bead whose descriptions were rewritten a dozen times, three of them to correct numbers given to Arthur the same day. Each error below was plausible, unverified, and contradicted by the code or the data within reach. They are listed so the next person does not repeat them.

| what we said | when | what was true | what to do instead |
| --- | --- | --- | --- |
| "Stored records correct themselves on the next pull, no backfill." | PR #59 body, 18 Sep; Arthur answered on it 21 Sep | A refresh reaches only selected records, and cannot tell a stand-in from a true point without provenance. | Before claiming anything about stored data, read the subtask that would do it, end to end. |
| "Older obscured records hold the shifted point." | PR #59 comment, 21 Sep | Most did not; they were built while the observation was open. | Measure before characterising a population. Production is one query away. |
| "129 wrong, 1,779 true" (true because not the current stand-in) | 22 Sep, first count | 149 more were older stand-ins from the same cell. | Compare against the private point, never the current public one. A stale stand-in is invisible to the public comparison. |
| Population is 1,930 (records with a privacy flag) | 22 Sep, first three counts | Flags exist only on refreshed records; the population is 4,132. | Start from iNaturalist's list of obscured observations. Never filter on our own copy of a field that is only sometimes refreshed. |
| 275 wrong; 187 unknowable; then 209 unknowable | 22 Sep, second and third counts | 271 and about 40. Four were double counted; the rest was the wrong population. | Rows must sum to the population. Send one message when the numbers are settled, not four. |
| "No project-admin token will ever reveal taxon-obscured coordinates." | beeline-b34, first version | 867 of 880 obscured observations, taxon-obscured included, are reachable. | Access follows the observer's project trust, not the kind of obscuring. |
| "Private coordinate access is working." | issue #25, 20 Jul and 16 Aug; PR #53 | It worked for the developer's curator token. Production's token belonged to a non-curator and got nothing. | Probe with the token the system uses, and check who it is with `/v1/users/me`. |
| PRs #53 and #54 "merged" | 30 Aug | Merged into each other's branches, never into `main`. Nothing shipped until #57 on 13 Sep. | Check the base branch of every PR in a stack before merging. |
| `viewer_trusted_by_observer: false` means no access | PR #23, Jul | It reports personal trust only. | Test for `private_geojson`. |
| Beeline's staging shows 1,641 stand-in specimens | beeline-b34 | Its dump was from 20 August, before any private point reached production. The gap to 271 is most likely the dump's age; that is a hypothesis, not a finding. | The count tracks the dump's age. Measure on the dump that will actually be imported. |

Two decisions were reversed rather than corrected, and both reversals are deliberate: PR #57 kept the stand-in for taxon-obscured records (Arthur and Andony then decided sensitivity is an export concern), and PR #54 cleared coordinates when access was withdrawn (Peter decided a true point is never given up).

The cost of the errors fell on Arthur, who answered two questions in good faith that then did not matter. Anything sent to him is measured first, and when a question he answered becomes moot he is told so and why.

## Open decisions

| decision | owner | where |
| --- | --- | --- |
| The 271 pinned labels: correct the records or keep them matching the pins | Arthur | PR #59 comments |
| Same decision, as it lands in the import: withhold judged stand-ins or import them | Arthur, via Peter | beeline-b34 |
| Whether an atlas may reveal taxon-obscured true coordinates on labels and in uploads | Andony and the uploaders, per atlas | [rainhead/beeline#13](https://github.com/rainhead/beeline/issues/13), Beeline `docs/questions.md` |
| Anonymous download of the occurrences CSV | whoever knows what volunteers agreed to | #58 |
| Stage `coordinateSource` and stop calling production provenance-free | Peter | Beeline |
| Manager role on 99706 and the full re-sync that follows | Andony, then Peter | beeline-b34 comment |

## History

- [#21](https://github.com/oregon-bee-project/OBP-Server/issues/21), [#31](https://github.com/oregon-bee-project/OBP-Server/pull/31) (Jul 2026): obscured records get a `geoprivacy` flag; Andony's request.
- [#42](https://github.com/oregon-bee-project/OBP-Server/issues/42), [#43](https://github.com/oregon-bee-project/OBP-Server/issues/43), [#50](https://github.com/oregon-bee-project/OBP-Server/pull/50) (Jul): `taxon_geoprivacy` flagged separately, at Arthur's request; privacy flags stop the locality flag.
- [#25](https://github.com/oregon-bee-project/OBP-Server/issues/25) (Jul, analysis 16 Aug): the private fields were dropped at two points; 0 stored records carried a flag; 252 printed occurrences belonged to since-obscured observations.
- [#52](https://github.com/oregon-bee-project/OBP-Server/pull/52), [#53](https://github.com/oregon-bee-project/OBP-Server/pull/53), [#54](https://github.com/oregon-bee-project/OBP-Server/pull/54) (merged 30 Aug; only #52 reached `main`): label gate; private coordinates and `coordinateSource`; refresh on re-pull.
- [#57](https://github.com/oregon-bee-project/OBP-Server/pull/57) (13 Sep): the stack finally on `main`; taxon-obscured records keep the stand-in; production's token found to be a non-curator's.
- [#59](https://github.com/oregon-bee-project/OBP-Server/pull/59) (open): true location or none; stored stand-ins off labels; taxon marker no longer blocks numbering or the labels file; a true point survives withdrawn access; this document.
- beeline-b34 in [rainhead/beeline](https://github.com/rainhead/beeline): the import side, with the same measurements from Beeline's store.
