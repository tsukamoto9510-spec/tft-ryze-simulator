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
    //    { id, cost, traitsMask (if possible? no, traits are multi-value for same type? No types are unique), traitIds: [] }
    //    Traits are unique per champ.
    const championData = champions.map((c, idx) => {
        const tIds = c.traits.map(t => traitToId[t]).filter(id => id !== undefined);
        return {
            original: c,
            id: idx,
            cost: c.cost,
            traitIds: tIds,
            // Bitmask for *existence* of valid traits (for pruning check)
            // Note: JS bitwise works on 32-bit integers. If numTraits > 32, we cannot use a single integer.
            // Currently numTraits is ~25 (based on traitMap). So we can use 32-bit int.
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
        if (count > 0 && count >= thresholds[i][0]) {
            score++;
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

        // Handle Locked Units
        // Pre-fill currentCounts and currentTeam
        const activeLockedIds = new Set();

        lockedSet.forEach(c => {
            if (activeLockedIds.has(c)) return; // Should not happen with Set but good to be safe
            activeLockedIds.add(c); // We need to map `c` back to optimized id? 
            // `c` is the original champion object.
            // We can find it in championData or just process it directly.
            // Simpler to just process it directly to fill counts, but we need to EXCLUDE it from candidates.

            currentTeam.push(c);
            currentCost += c.cost;

            c.traits.forEach(t => {
                const tid = traitToId[t];
                if (tid !== undefined) currentCounts[tid]++;
            });
        });

        if (currentTeam.length > maxLevel) {
            resolve([]);
            return;
        }

        // Prepare Candidates
        // Exclude banned and locked units
        // Filter out units that don't contribute to ANY required trait if requirements exist?
        // Actually, if we have slots left, we might want units for filler or synergy even if not efficiently contributed?
        // But the user usually wants to minimize cost or maximize score for specific reqs.
        // For strict Requirement satisfaction, we MUST meet requirements.
        // Units that don't satisfy requirements might still be needed if we need body count?
        // But assuming we want to minimal team to satisfy REQS + Maximize synergies.
        // The original logic filtered: `reqs.some(r => c.traits.includes(r.trait))` 
        // This implies we ONLY consider champions that contribute to at least one REQUIREMENT.

        const candidates = championData.filter(c => {
            if (bannedSet.has(c.original)) return false;
            if (lockedSet.has(c.original)) return false;
            if (hasRequirements) {
                // Check if contributes to any NEEDED trait?
                // Original logic: `reqs.some(...)`.
                return (c.mask & neededMask) !== 0;
            }
            return true;
        });

        // Optimization: Suffix ORs for candidates
        // suffixMasks[i] = OR of all masks from i to end.
        // Allows O(1) check: can we possibly fulfill remaining needs?
        const nCandidates = candidates.length;
        const suffixMasks = new Int32Array(nCandidates + 1);
        for (let i = nCandidates - 1; i >= 0; i--) {
            suffixMasks[i] = suffixMasks[i + 1] | candidates[i].mask;
        }

        const results = [];
        const MAX_RESULTS = 20;

        // Current state for backtracking
        // We use recursion. to avoid passing large arrays, we just update `currentCounts`.

        // We need to track "remaining need" to check satisfaction quickly?
        // Or just check satisfied at leaf or pruning?
        // bitmask `unsatisfiedMask` where bit is set if trait req is not met.

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

            if (currentTeam.length >= maxLevel) return;
            if (idx >= nCandidates) return;

            // Pruning:
            // Check if remaining candidates can satisfy unsatisfied traits
            // We check trait EXISTENCE first using bitmask
            if ((unsatisfied & suffixMasks[idx]) !== unsatisfied) {
                // Even if we take ALL relevant remaining units, we miss some traits types entirely.
                return;
            }

            // Pruning 2: Count check (more expensive, do it only if deep?)
            // If we need 5 more 'Ionia' but only 3 'Ionia' units left in candidates[idx..]
            // We can precompute specific counts suffix arrays too, but that's memory heavy (25 * N).
            // Maybe skip for now, bitmask is strong enough for "existence".
            // However, with duplicates allowed or multi-trait, count check is specific.
            // Since we sorted candidates? No we didn't sort.
            // Sorting candidates by "rarity" or "traits count" might help greedy approach but BFS/DFS handles it.

            // Attempt to ADD candidate[idx]
            const cand = candidates[idx];

            // Optimization: Only add if it helps unsatisfied traits?
            // If `(cand.mask & unsatisfied) === 0`, needed traits are not improved. 
            // BUT, adding it might trigger a higher tier for a satisfied trait?
            // User requested optimizing code, but logic should be "Find teams that satisfy REQS".
            // So if it doesn't help with unsatisfied reqs, do we skip?
            // If we have free slots, adding a non-helping unit increases cost without helping reqs.
            // UNLESS it provides a trait that wasn't required but is nice to have?
            // But results are sorted by Score. Score is total traits active.
            // So adding ANY unit might increase score.
            // BUT, our primary goal is to SATISFY REQS first.
            // If we strictly follow "backtrack" logic, we try both adding and skipping.

            // Try Adding
            currentTeam.push(cand.original);
            const addedTraits = cand.traitIds;
            for (let i = 0; i < addedTraits.length; i++) currentCounts[addedTraits[i]]++;
            currentCost += cand.cost;

            solve(idx + 1);

            // Backtrack
            currentCost -= cand.cost;
            for (let i = 0; i < addedTraits.length; i++) currentCounts[addedTraits[i]]--;
            currentTeam.pop();

            // Try Skipping
            solve(idx + 1);
        }

        // To yield to UI, we wrap in setTimeout
        setTimeout(() => {
            // Sort candidates? Heuristic: units filling rarer traits first?
            // Or units with MORE traits first?
            // sorting candidates by cost asc or desc?
            // Default order is fine.

            solve(0);

            // Sort results
            results.sort((a, b) => b.score - a.score || a.totalCost - b.totalCost);
            resolve(results.slice(0, 20));
        }, 50);
    });
}
