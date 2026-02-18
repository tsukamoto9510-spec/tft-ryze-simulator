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
        let candidates = championData.filter(c => {
            if (bannedSet.has(c.original)) return false;
            if (lockedSet.has(c.original)) return false;
            if (hasRequirements) {
                // Check if contributes to any NEEDED trait?
                return (c.mask & neededMask) !== 0;
            }
            return true;
        });

        // Sort candidates by cost (ascending) to prioritize cheaper units
        candidates.sort((a, b) => a.cost - b.cost);

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

        // Iterative Deepening Search
        // We try to find solutions with exact number of added units: 0, 1, 2, ...
        // However, since units have different slots, we iterate on *slots* used?
        // Actually, just iterating on *recursion depth* (number of added units) is often enough for "minimal subset".
        // But to be very strict about "minimal slots", we can just iterate on maxSlots.
        // Let's iterate on "number of additional units allowed".

        // But standard backtracking with cost-sorted candidates and "return on first solution"
        // is ALMOST good enough if we strictly limit depth.
        // To maximize speed and minimal results, we use Iterative Deepening on *number of added units*.

        let foundSolutionInPass = false;

        function solve(idx, depthLimit) {
            if (results.length >= MAX_RESULTS) return;
            // Strict check: if we found a solution at this depth (or shallower), 
            // we generally don't want to go much deeper unless we need more variations.
            // But for "minimal subset", once we find ONE at depth K, we might want others at depth K,
            // but NOT depth K+1.

            const unsatisfied = getUnsatisfiedMask();

            if (unsatisfied === 0) {
                // All requirements met!
                // New Score Logic: Synergy Score * 10000 + Cost
                // calcScoreOptimized returns sum of active tiers
                const synergyScore = calcScoreOptimized(currentCounts, thresholds);
                results.push({
                    team: [...currentTeam],
                    score: (synergyScore * 10000) + currentCost, // Favors more synergies, then higher cost
                    totalCost: currentCost
                });
                foundSolutionInPass = true;
                return;
            }

            if (depthLimit === 0) return;

            // Simple pruning
            if (currentSlots >= maxLevel) return;
            if (idx >= nCandidates) return;

            // Suffix pruning
            if ((unsatisfied & suffixMasks[idx]) !== unsatisfied) {
                return;
            }

            const cand = candidates[idx];

            // Try Adding
            if (currentSlots + cand.slots <= maxLevel) {
                currentTeam.push(cand.original);
                const addedTraits = cand.traitIds;

                for (let i = 0; i < addedTraits.length; i++) {
                    const id = addedTraits[i];
                    currentCounts[id] += cand.traitCounts[id];
                }

                currentCost += cand.cost;
                currentSlots += cand.slots;

                solve(idx + 1, depthLimit - 1);

                // Backtrack
                currentSlots -= cand.slots;
                currentCost -= cand.cost;
                for (let i = 0; i < addedTraits.length; i++) {
                    const id = addedTraits[i];
                    currentCounts[id] -= cand.traitCounts[id];
                }
                currentTeam.pop();
            }

            // Try Skipping
            // If we skip, we can still add more units if depthLimit allows
            // Optimization: if we skip cand[idx], can we still solve it?
            solve(idx + 1, depthLimit); // Simply allowing skip doesn't reduce depthLimit
            // Wait, standard Iterative Deepening on *depth* means we consume depth when we ADD.
            // So skipping does NOT consume depth.
            // But if we skip forever, we hit end of candidates.
        }

        // To yield to UI
        setTimeout(() => {
            // Max additional units we can add is (maxLevel - currentSlots)
            // But usually we find solution within 2-4 units.
            const maxAdded = maxLevel - currentSlots;

            // Iterative Deepening
            for (let depth = 0; depth <= maxAdded; depth++) {
                // If we found solutions in previous *smaller* depth, we strictly STOP?
                // Or do we want to show a few variations?
                // User asked for "consistency" and "minimal". 
                // A solution with 3 units is strictly better than 4 units for this purpose.

                // Clear previous deeper results if we want strict minimal? 
                // No, we just search layer by layer.

                if (results.length > 0) break; // If we found ANY solution at depth K, stop looking at K+1.

                // We need a specific solver for *exact* depth or *max* depth?
                // Standard IDDFS uses depth-limited search (max depth).
                // solve(0, depth);

                // We need to implement a "solve with max depth k" and it will find all solutions <= k.
                // But since we loop depth 0..max, we will rediscover depth k-1 solutions!
                // We usually modify solver to only return solutions *at* depth k, or keep cache.
                // Or, simply: since candidates are sorted by cost, and we check small depths first,
                // we just run one pass with a limit?

                // Let's refine: We actully just want to find solutions.
                // The issue with the previous code was it didn't respect a "limit" and just dove deep.
                // We will use a modified DFS that respects a `maxAddedUnits` parameter.

                solve_depth_limited(0, depth);
            }

            // Sort: Fewer slots > Lower Cost
            results.sort((a, b) => b.score - a.score);
            resolve(results.slice(0, MAX_RESULTS));
        }, 50);

        function solve_depth_limited(idx, allowedAdds) {
            if (results.length >= MAX_RESULTS) return;

            const unsatisfied = getUnsatisfiedMask();
            if (unsatisfied === 0) {
                const synergyScore = calcScoreOptimized(currentCounts, thresholds);
                results.push({
                    team: [...currentTeam],
                    score: (synergyScore * 10000) + currentCost,
                    totalCost: currentCost
                });
                return;
            }

            if (allowedAdds <= 0) return;
            if (idx >= nCandidates) return;
            if (currentSlots >= maxLevel) return;

            // Pruning
            if ((unsatisfied & suffixMasks[idx]) !== unsatisfied) return;

            const cand = candidates[idx];

            // 1. Try Adding (Consumes 1 allowedAdd)
            if (currentSlots + cand.slots <= maxLevel) {
                currentTeam.push(cand.original);
                const addedTraits = cand.traitIds;
                for (let i = 0; i < addedTraits.length; i++) {
                    const id = addedTraits[i];
                    currentCounts[id] += cand.traitCounts[id];
                }
                currentCost += cand.cost;
                currentSlots += cand.slots;

                solve_depth_limited(idx + 1, allowedAdds - 1);

                currentSlots -= cand.slots;
                currentCost -= cand.cost;
                for (let i = 0; i < addedTraits.length; i++) {
                    const id = addedTraits[i];
                    currentCounts[id] -= cand.traitCounts[id];
                }
                currentTeam.pop();
            }

            // 2. Try Skipping (Does NOT consume allowedAdd, but moves to next candidate)
            solve_depth_limited(idx + 1, allowedAdds);
        }
    });
}

