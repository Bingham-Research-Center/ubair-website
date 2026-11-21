# Plain Words Glossary

The words this project uses, for someone who has just arrived. One or two lines each; the
pages in this folder say more.

## The place and the problem

| Word | Meaning |
|---|---|
| **The Basin** | The Uinta Basin in north-east Utah: Vernal, Roosevelt, Duchesne and the country around them, ringed by mountains |
| **Winter ozone** | Ozone is an air pollutant. In most places it is a summer problem. In the Basin it builds in **winter**, when snow covers the ground and cold air is trapped under warmer air. It is why this site exists: `docs/WINTER-OZONE-SCIENCE.md` |
| **Inversion, cold pool** | Cold air sitting in the valley with warmer air on top, like a lid. Pollution collects under the lid |
| **Ozone outlook** | A short written forecast of ozone risk for the next 15 days, by the project's forecasters. Risk words: NO, LOW, SOME, MODERATE, HIGH |
| **Clyfar** | The project's own ozone prediction model (the name is Welsh for "wise") |

## Who supplies what

| Word | Meaning |
|---|---|
| **NWS** | The National Weather Service. The official source of forecasts, watches and warnings |
| **Watch, warning, advisory** | NWS alert levels. A **warning** means hazardous weather is happening or about to; a **watch** means it may; an **advisory** is for weather that is a nuisance or a lesser hazard |
| **UDOT** | The Utah Department of Transportation. Supplies road reports, cameras and road weather stations |
| **RWIS** | A road weather station: sensors in and beside the road (surface state, temperature, wind gusts) |
| **Synoptic** | A service that gathers weather-station observations. The site's observations come through it |
| **Observation ("obs")** | A measurement from an instrument, as opposed to a model's forecast |

## Weather models

| Word | Meaning |
|---|---|
| **Model** | A computer simulation of the weather. Its output is a forecast, not a measurement |
| **HRRR** | A US weather model with fine detail (3 km), re-run every hour, that looks 18 to 48 hours ahead |
| **GEFS** | A US **ensemble** model: 31 runs with slightly different starting points, about 16 days ahead |
| **Ensemble, spread** | Many runs of one model. Where the runs agree, confidence is higher; "spread" is how far apart they are |
| **Run, init** | One execution of a model, named for when it started: "the 03Z run" |
| **03Z, UTC** | Model time. `Z` is UTC, the worldwide clock. The Basin is 7 hours behind it in winter (03Z is 8 PM the evening before) and 6 behind in summer. The site shows Mountain time to visitors |
| **Liquid equivalent** | Precipitation measured as water. An inch of water is very roughly ten inches of snow |
| **Running total** | An amount that keeps adding up since the model run began, as opposed to an amount for one hour. Two fields in our files are running totals with hourly-sounding names: see [WEATHER-FORECAST-PAGE.md](WEATHER-FORECAST-PAGE.md) |

## How the site is put together

| Word | Meaning |
|---|---|
| **Producer** | A computer that works data out and **sends** it to the website. The website never fetches these files |
| **CHPC, notchpeak** | The University of Utah's computing centre and one of its machines, where the main producer runs |
| **brc-tools** | The Python code that runs at CHPC and makes most of the files. A separate repository |
| **dataType** | The kind of file being sent (`observations`, `forecasts`, …). Each has its own folder: [DATA-UPLOAD-PATH.md](DATA-UPLOAD-PATH.md) |
| **The manifest** | `DATA_MANIFEST.json`: the written agreement on what each kind of file contains |
| **`.com` and `.dev`** | Two copies of the site on two servers. `www.basinwx.com` is the public one ("prod"). `www.basinwx.dev` is the rehearsal copy, where changes land first. Both receive the same data |
| **`dev`, `ops`, `main`** | Branches of the code. `dev` runs on `.dev`; `ops` runs on `.com`; `main` records releases. Changes go into `dev` first, by pull request |
| **PR (pull request)** | A proposed change, reviewed and tested before it is merged |
| **Slice** | One finished piece of a larger plan, small enough to be one PR |
| **Version, patch** | `1.7.6`: the last number (the "patch") goes up with each slice. `-dev` on the end means "not released yet" |
| **Preview** | A branch running at its own address (`theme.basinwx.dev`) so it can be looked at before merging |

## Words on the pages

| Word | Meaning |
|---|---|
| **Pane** | One of the site's square boxes with a short coloured tab on its top edge |
| **Token** | A named colour or size (`--status-danger`). Pages use the names; the values live in one file |
| **Status light** | One of the homepage tiles: [HOMEPAGE-STATUS-LIGHTS.md](HOMEPAGE-STATUS-LIGHTS.md) |
| **Grey** | "We do not know." Never a quiet day in disguise |
| **Floor, benches, passes** | Low, middle and high ground: below 5,900 ft, 5,900 to 7,500 ft, and above |
| **LLM** | A large language model: software that writes text. Text from one is always labelled |
| **Ffion, Rhiannon** | The names of the two LLM "personas" that will write forecast text. Readers see "LLM forecast" instead: [LLM-FORECAST-TEXT.md](LLM-FORECAST-TEXT.md) |
| **Tier** | One of three versions of a text: Public, Industry, Expert |
| **Kiosk mode** | A page stepping through its content by itself, for a screen on a wall |

## Two rules you will see everywhere

1. **Never invent data.** If something cannot be fetched, the page says so or shows nothing. It
   never shows a plausible stand-in, and that includes the answer "none".
2. **Convert at display.** Files arrive in SI units (°C, m/s, mm). Pages convert to °F, mph and
   inches when they draw, with `public/js/met.js`, and show `--` for a unit they do not know.
