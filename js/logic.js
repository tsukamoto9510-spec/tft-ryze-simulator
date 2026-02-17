function calcScore(team) {
    const counts = {};
    team.forEach(c => c.traits.forEach(t => counts[t] = (counts[t] || 0) + 1));
    return Object.entries(counts).filter(([t, count]) => count >= (traitRules[t]?.[0] || 2)).length;
}

function search(maxLevel, reqs, lockedSet, bannedSet, champions) {
    return new Promise((resolve) => {
        const candidates = champions.filter(c => !bannedSet.has(c) && !lockedSet.has(c) && reqs.some(r => c.traits.includes(r.trait)));
        const results = [];

        function backtrack(idx, currentTeam, currentCounts) {
            // 条件達成チェック
            const isSatisfied = reqs.every(r => (currentCounts[r.trait] || 0) >= r.target);

            if (isSatisfied) {
                results.push({
                    team: [...currentTeam],
                    score: calcScore(currentTeam),
                    totalCost: currentTeam.reduce((s, c) => s + c.cost, 0)
                });
                if (currentTeam.length === maxLevel) return;
            }

            if (currentTeam.length >= maxLevel || idx >= candidates.length) return;

            // 枝刈り: 残り全員足しても届かない場合はスキップ
            const remaining = maxLevel - currentTeam.length;
            // 簡易的な枝刈りチェック
            // 正確には各reqsについて、candidatesの残りの中に必要なtraitを持つキャラが足りるか確認すべきだが
            // 元のロジックを尊重して、ここでは一旦スキップ（元コードでは `canReach` のロジックがあったがコメントアウト気味だったか？いや、実装されていた）

            // Re-implementing pruning from original code
            const canReach = reqs.every(r => {
                const needed = r.target - (currentCounts[r.trait] || 0);
                if (needed <= 0) return true;
                // ここで候補の残り人数をチェックするのはコストがかかるので、元コード通り `return true` でプレースホルダになっているならそのままにする
                // 元コード: return true; となっている (Step 7 lines 85-90)
                return true;
            });
            if (!canReach) return;

            // 採用
            const c = candidates[idx];
            currentTeam.push(c);
            c.traits.forEach(t => currentCounts[t] = (currentCounts[t] || 0) + 1);
            backtrack(idx + 1, currentTeam, currentCounts);

            // 非採用
            c.traits.forEach(t => currentCounts[t]--);
            currentTeam.pop();
            backtrack(idx + 1, currentTeam, currentCounts);
        }

        const initialCounts = {};
        lockedSet.forEach(c => c.traits.forEach(t => initialCounts[t] = (initialCounts[t] || 0) + 1));

        // Yield to event loop to allow UI updates
        setTimeout(() => {
            backtrack(0, Array.from(lockedSet), initialCounts);
            results.sort((a, b) => b.score - a.score || b.totalCost - a.totalCost);
            resolve(results.slice(0, 20)); // Limit results here or in UI? Original sliced in display
        }, 50);
    });
}
