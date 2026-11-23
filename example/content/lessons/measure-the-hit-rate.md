---
title: Measure the Hit Rate
summary: Use request counts to see how often the cache serves a value.
---

## Count hits and misses

```step
diagram:
  type: image
  src: diagrams/hit-rate.png
  alt: Ten request cells. Eight are green for hits and two are gray for misses.
  caption: Eight hits in ten lookups give a hit rate of 80%.
```

Count each cache lookup as a hit or a miss. Divide the number of hits by the total number of lookups.

```text
8 hits / 10 lookups = 80%
```

## Compare two time windows

```step
diagram:
  type: custom
  name: hit-rate
  alt: The hit rate increases from 40% to 80%.
  data:
    before: 40
    after: 80
  caption: Use comparable time windows when you measure a change.
```

Compare windows with a similar request mix. A higher hit rate can reduce database reads, but measure database reads directly to find the actual change.
