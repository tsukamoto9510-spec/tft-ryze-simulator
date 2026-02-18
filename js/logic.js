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
        const neededCounts = new Int8Array(numTraits);
        let hasRequirements = false;
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

            const tIds = c.traits.map(t => traitToId[t]).filter(id => id !== undefined);
            tIds.forEach(id => {
                const traitName = c.traits.find(t => traitToId[t] === id);
                let count = 1;
                if (c.traitCounts && c.traitCounts[traitName]) {
                    count = c.traitCounts[traitName];
                }
                currentCounts[id] += count;
            });
        });

        if (currentSlots > maxLevel) {
            resolve([]);
            return;
        }

        // Prepare Candidates
        let candidates = championData.filter(c => {
            if (bannedSet.has(c.original)) return false;
            if (lockedSet.has(c.original)) return false;
            if (hasRequirements) {
                // Check if contributes to any NEEDED trait?
                // Minimal subset optimization: Only include units that contribute to *unmet* requirements?
                // But requirements can be met and then we want more synregies?
                // User said "Minimal Subset" is the goal for requirements.
                // But we still need to allow units that satisfy *future* requirements if we add them?
                // For now, keep the simple check: must contribute to at least one required trait
                // UNLESS we want to fill slots with just anything? 
                // No, the user wants "Minimal Subset" to satisfy REQS.
                return (c.mask & neededMask) !== 0;
            }
            return true;
        });

        // SORT candidates by Cost ASCENDING for the search.
        // This helps find the "Cheapest Minimal" solution first within the same depth.
        candidates.sort((a, b) => a.cost - b.cost);

        // Optimization: Suffix ORs for candidates to prune branches that can't satisfy needs
        const nCandidates = candidates.length;
        const suffixMasks = new Int32Array(nCandidates + 1);
        for (let i = nCandidates - 1; i >= 0; i--) {
            suffixMasks[i] = suffixMasks[i + 1] | candidates[i].mask;
        }

        const results = [];
        const MAX_RESULTS = 50;

        function getUnsatisfiedMask() {
            let mask = 0;
            for (let i = 0; i < numTraits; i++) {
                if (neededCounts[i] > 0 && currentCounts[i] < neededCounts[i]) {
                    mask |= (1 << i);
                }
            }
            return mask;
        }

        // Iterative Deepening DFS (IDDFS)
        // We iterate on the number of *additional* units to add.
        // This guarantees we find solutions with 0 added units, then 1, then 2...
        const maxAdded = maxLevel - currentSlots;
        let foundMinimalSolution = false;

        // To yield to UI
        setTimeout(() => {
            // IDDFS Loop
            for (let depth = 0; depth <= maxAdded; depth++) {
                // If we found solutions at a previous depth, we STOP looking at deeper levels.
                // This guarantees "Number of Units" is strictly minimized.
                if (results.length > 0) break;

                solve_depth_limited(0, depth);
            }

            // Final Sort:
            // 1. Number of Units (Ascending) - Implicitly handled by IDDFS mostly, but explicit sort is safe.
            // 2. Trait Score (Descending) - More active traits/tiers is better.
            // 3. Total Cost (Descending) - Expensive is better (Stronger units).
            // Note: In search we sorted candidates by Cost ASC to find *any* solution quickly?
            // Actually, if we want "Expensive" to be better in final sort, maybe we should search Expensive first?
            // BUT: "Minimal Subset" usually implies "Least investment to activate". 
            // User said: "Conditions met" > "Fewest Units" > "Score" > "Cost(High)".
            // If we find 3 units (Cost 1,1,1) and 3 units (Cost 5,5,5), both are depth 3.
            // IDDFS will find both if we don't return early.
            // We should gather ALL solutions at minimal depth, then sort.

            results.sort((a, b) => {
                // 1. Number of Units (Asc)
                if (a.team.length !== b.team.length) return a.team.length - b.team.length;

                // 2. Trait Score (Desc)
                // We need to re-calc simple score or use the one stored.
                // Let's assume 'score' in result is Trait Score.
                if (b.score !== a.score) return b.score - a.score;

                // 3. Total Cost (Desc)
                return b.totalCost - a.totalCost;
            });

            resolve(results.slice(0, MAX_RESULTS));
        }, 50);

        function solve_depth_limited(idx, allowedAdds) {
            // If we have enough results for this depth, maybe stop?
            // But we want to find the BEST among this depth (High Cost/High Score).
            // So we should probably continue searching this depth until exhaust or generous limit.
            if (results.length >= MAX_RESULTS * 2) return;

            const unsatisfied = getUnsatisfiedMask();
            if (unsatisfied === 0) {
                const synergyScore = calcScoreOptimized(currentCounts, thresholds);
                results.push({
                    team: [...currentTeam],
                    score: synergyScore, // Pure trait score
                    totalCost: currentCost
                });
                return;
            }

            if (allowedAdds <= 0) return;
            if (idx >= nCandidates) return;
            if (currentSlots >= maxLevel) return;

            // Pruning: fast check if remaining candidates can satisfy requirements
            // Only checks existence of traits, not counts (limitation of bitmask)
            // But if mask doesn't even have the bit, satisfying is impossible.
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

                // Backtrack
                currentSlots -= cand.slots;
                currentCost -= cand.cost;
                for (let i = 0; i < addedTraits.length; i++) {
                    const id = addedTraits[i];
                    currentCounts[id] -= cand.traitCounts[id];
                }
                currentTeam.pop();
            }

            // 2. Try Skipping (Does NOT consume allowedAdd)
            solve_depth_limited(idx + 1, allowedAdds);
        }
    });
}

