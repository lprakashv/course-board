---
title: Keep Data Current
summary: Remove an old cached value after a database write.
---

## Choose an expiry time

Use a shorter lifetime when values change often. Use a longer lifetime when values change less often and more cache hits are useful.

asdasd

## Remove a stale copy

```step
diagram:
  type: excalidraw
  src: diagrams/invalidate.svg
  source: diagrams/invalidate.excalidraw
  alt: Write the new record to the database, then remove the old cache entry.
  caption: The next cache miss reads the new version.
```

Write the new value to the database. Then remove the old value from the cache. The next read can fetch the new value and fill the cache again.

> **Assumption.** This example has one writer and no concurrent reads between the write and removal.

Sample text
