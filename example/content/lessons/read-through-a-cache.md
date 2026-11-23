---
title: Read Through a Cache
summary: Compare a cache hit with a cache miss and see when the service reads the database.
---

## Check the cache first

```step
diagram:
  type: excalidraw
  source: diagrams/4724692ed4bbc3f30536c1802e1094f6cad0cd7a03d35affc4dd4143073c909e.excalidraw
  src: diagrams/e28abca053811e451d033d8865b74e8d97e56a3903963314e749250605b8bf22.svg
  alt: The service looks up product 42 in the cache. The database is idle.
  caption: The service checks the cache before it reads the database.
```

First of all

A request asks for product 42. The service uses the product ID to form the key `product:42`.

1. Look up the key in the cache.
2. Check if the stored value is still valid.

A valid stored value gives you a **cache hit**.

## Return a hit

```step
diagram:
  type: ascii
  alt: The request goes from the client to the service to the cache. The cache returns product 42.
  text: |
    Client --> Service --> Cache
                   <------ product:42
```

On a hit, the service returns the cached value. This request does not use the database.

> **Assumption.** The cache entry has a valid lifetime when the service reads it.

## Fill a miss

```step
diagram:
  type: html
  src: diagrams/miss.html
  alt: Read product 42 from the database, store a copy in the cache, and return the record.
  caption: A miss can prepare the cache for the next request.
```

If the key is absent or expired, the service reads the database. This is a **cache miss**.

The service stores a copy with an expiry time, then sends the value to the client.
