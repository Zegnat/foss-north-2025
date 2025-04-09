# foss-north 2025

## Calendar

The [conference schedule][] has been made available as an HTML page. And all the
speakers are available as raw YAML data on GitHub:

[foss-north/fn-static-generator-mkii][speakers]

But I wanted to get all the times into my actual calendar. Generate an ics file
using the script in this repository:

```fish
fnm use --install-if-missing --resolve-engines
npm ci --omit="dev"
npm run build:data
npm run build:calendar > fossnorth2025.ics
```

[conference schedule]: https://foss-north.se/2025/schedule.html
[speakers]: https://github.com/foss-north/fn-static-generator-mkii/blob/master/source/2025/_data/speakers.yaml
