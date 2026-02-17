// --------------------------------------------------------------------------
// Optimization: Bitmask & Precomputed Data Structures
// --------------------------------------------------------------------------

// Cache for optimized data to avoid re-processing on every search if data hasn't changed.
let optimizedDataCache = null;

function getOptimizedData(champions) {
    if (optimizedDataCache) return optimizedDataCache;

    // 1. Map traits to integer IDs (0..N)
    const traits = Object.keys(traitRules);
    const traitToId = {};
    traits.forEach((t, i) => traitToId[t] = i);
    const numTraits = traits.length;

    // 2. Convert trait requirements to efficient lookup
    //    We need to quickly know "next threshold" for a trait.
    //    thresholds[traitId] = [2, 4, 6, ...]
    const thresholds = new Array(numTraits);
    for (let i = 0; i < numTraits; i++) {
        thresholds[i] = traitRules[traits[i]] || [2]; // Default to [2] if missing?
    }

    // 3. Convert champions to struct
    //    { id, cost, traitsMask, traitIds: [], slots, traitCounts: [] }
    const championData = champions.map((c, idx) => {
        const tIds = c.traits.map(t => traitToId[t]).filter(id => id !== undefined);

        // Prepare trait counts array for this champion
        // traitCounts[traitId] = count (usually 1, but 2 for Baron's Void)
        const tCounts = new Int8Array(numTraits);
        tIds.forEach(id => {
            // Check if champion has special traitCounts
            const traitName = c.traits.find(t => traitToId[t] === id);
            let count = 1;
            if (c.traitCounts && c.traitCounts[traitName]) {
                count = c.traitCounts[traitName];
            }
            tCounts[id] = count;
        });

        return {
            original: c,
            id: idx,
            cost: c.cost,
            slots: c.slots || 1, // Default 1 slot
            traitIds: tIds,
            traitCounts: tCounts, // optimization for fast add
            // Bitmask for *existence* of valid traits (for pruning check)
            mask: tIds.reduce((m, id) => m | (1 << id), 0)
        };
    });

    optimizedDataCache = { traitToId, thresholds, championData, numTraits };
    return optimizedDataCache;
}

function calcScoreOptimized(currentCounts, thresholds) {
    let score = 0;
    // We can iterate only over traits that have count > 0, but currentCounts is a raw array.
    // Iterating over all traits (approx 25) is fast enough.
    for (let i = 0; i < thresholds.length; i++) {
        const count = currentCounts[i];
        if (count > 0) {
            // Find active tier
            const tiers = thresholds[i];
            // Since tiers are sorted [2, 4, 6, ...], simple check
            // Optimization: could binary search but small array
            let tierScore = 0;
            for (let j = 0; j < tiers.length; j++) {
                if (count >= tiers[j]) tierScore++;
                else break;
            }
            score += tierScore;
        }
    }
    return score;
}

function search(maxLevel, reqs, lockedSet, bannedSet, champions) {
    return new Promise((resolve) => {
        const { traitToId, thresholds, championData, numTraits } = getOptimizedData(champions);

        // Filter and Pre-process Requirements
        // targetCounts[traitId] = target
        const neededCounts = new Int8Array(numTraits);
        let hasRequirements = false;

        // Active requirements bitmask
        let neededMask = 0;

        reqs.forEach(r => {
            const id = traitToId[r.trait];
            if (id !== undefined) {
                neededCounts[id] = r.target;
                neededMask |= (1 << id);
                hasRequirements = true;
            }
        });

        // Current state
        const currentCounts = new Int8Array(numTraits);
        const currentTeam = [];
        let currentCost = 0;
        let currentSlots = 0;

        // Handle Locked Units
        const activeLockedIds = new Set();
        let possible = true;

        lockedSet.forEach(c => {
            if (activeLockedIds.has(c)) return;
            activeLockedIds.add(c);

            currentTeam.push(c);
            currentCost += c.cost;
            currentSlots += (c.slots || 1);

            // Update counts carefully
            const tIds = c.traits.map(t => traitToId[t]).filter(id => id !== undefined);
            tIds.forEach(id => {
                const traitName = c.traits.find(t => traitToId[t] === id);
                let count = 1;
                if (c.traitCounts && c.traitCounts[traitName]) {
                    count = c.traitCounts[traitName];
                }
                currentCounts[id] += count; // Use count value
            });
        });

        if (currentSlots > maxLevel) {
            // Locked units exceed max level slots
            resolve([]);
            return;
        }

        // Prepare Candidates
        const candidates = championData.filter(c => {
            if (bannedSet.has(c.original)) return false;
            if (lockedSet.has(c.original)) return false;
            if (hasRequirements) {
                // Check if contributes to any NEEDED trait?
                return (c.mask & neededMask) !== 0;
            }
            return true;
        });

        // Optimization: Suffix ORs for candidates
        const nCandidates = candidates.length;
        const suffixMasks = new Int32Array(nCandidates + 1);
        for (let i = nCandidates - 1; i >= 0; i--) {
            suffixMasks[i] = suffixMasks[i + 1] | candidates[i].mask;
        }

        const results = [];
        // Increase max results slightly
        const MAX_RESULTS = 20;

        function getUnsatisfiedMask() {
            let mask = 0;
            for (let i = 0; i < numTraits; i++) {
                if (neededCounts[i] > 0 && currentCounts[i] < neededCounts[i]) {
                    mask |= (1 << i);
                }
            }
            return mask;
        }

        function solve(idx) {
            const unsatisfied = getUnsatisfiedMask();

            if (unsatisfied === 0) {
                // All requirements met!
                results.push({
                    team: [...currentTeam],
                    score: calcScoreOptimized(currentCounts, thresholds),
                    totalCost: currentCost
                });
                return;
            }

            // Check if we can add ANY more units
            // Small optimization: minimal unit is 1 slot
            if (currentSlots >= maxLevel) return;

            if (idx >= nCandidates) return;

            // Pruning:
            if ((unsatisfied & suffixMasks[idx]) !== unsatisfied) {
                return;
            }

            const cand = candidates[idx];

            // Try Adding (if slots allow)
            if (currentSlots + cand.slots <= maxLevel) {
                currentTeam.push(cand.original);
                const addedTraits = cand.traitIds;

                // Add counts using precomputed traitCounts
                for (let i = 0; i < addedTraits.length; i++) {
                    const id = addedTraits[i];
                    currentCounts[id] += cand.traitCounts[id];
                }

                currentCost += cand.cost;
                currentSlots += cand.slots;

                solve(idx + 1);

                // Backtrack
                currentSlots -= cand.slots;
                currentCost -= cand.cost;
                for (let i = 0; i < addedTraits.length; i++) {
                    const id = addedTraits[i];
                    currentCounts[id] -= cand.traitCounts[id]; // Subtract correct amount
                }
                currentTeam.pop();
            }

            // Try Skipping
            solve(idx + 1);
        }

        // To yield to UI, we wrap in setTimeout
        setTimeout(() => {
            solve(0);
            // Sort results
            results.sort((a, b) => b.score - a.score || a.totalCost - b.totalCost);
            resolve(results.slice(0, MAX_RESULTS));
        }, 50);
    });
}

