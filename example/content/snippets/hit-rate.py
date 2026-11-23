def hit_rate(hits, misses):
    lookups = hits + misses
    return hits / lookups if lookups else 0.0
