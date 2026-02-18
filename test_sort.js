const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFile(filename) {
    return fs.readFileSync(path.join(__dirname, 'js', filename), 'utf8');
}

const sandbox = {
    console: console,
    setTimeout: (cb, ms) => cb(), // Mock setTimeout to run immediately
    Set: Set,
    Map: Map,
    Array: Array,
    Object: Object,
    Promise: Promise,
    Int8Array: Int8Array,
    Int32Array: Int32Array
};
vm.createContext(sandbox);

try {
    const dataScript = loadFile('data.js').replace(/const /g, 'var ');
    const logicScript = loadFile('logic.js');
    const fullScript = dataScript + '\n' + logicScript;
    vm.runInContext(fullScript, sandbox);

    const champions = sandbox.champions;
    const lockedSet = new Set();
    const bannedSet = new Set();
    const maxLevel = 9;

    console.log("Running Sorting Logic Test...");

    // Test Case: Find combinations that allow comparison
    // We'll search for something generic to get multiple results
    // Let's ask for "Bruiser" (assuming it has multiple easy low cost options)
    const reqs = [{ trait: "Bruiser", target: 2 }];

    sandbox.search(maxLevel, reqs, lockedSet, bannedSet, champions).then(results => {
        if (results.length === 0) {
            console.log("No results found.");
            return;
        }

        console.log(`Found ${results.length} results.`);

        let previousScore = Infinity;
        let isSorted = true;

        results.forEach((r, index) => {
            console.log(`Rank ${index + 1}: Score ${r.score} | Cost ${r.totalCost} | Slots ${r.team.length}`);
            r.team.forEach(c => console.log(`  - ${c.name} (${c.cost}G)`));

            // Check if sorted descending
            if (r.score > previousScore) {
                isSorted = false;
                console.error(`  [ERROR] Not sorted correctly! Rank ${index} (${previousScore}) < Rank ${index + 1} (${r.score})`);
            }
            previousScore = r.score;
        });

        if (isSorted) {
            console.log("\n[SUCCESS] Results are sorted by score descending.");
        } else {
            console.log("\n[FAILURE] Results are NOT sorted correctly.");
        }

        // Additional Logic Check:
        // Rank 1 should have higher cost than Rank 2 if synergy is same
        if (results.length >= 2) {
            const r1 = results[0];
            const r2 = results[1];
            // Calculate synergies manually to verify score logic
            // But we can just check if score logic makes sense
            // Score = Synergy*10000 + Cost
            // If Synergy1 == Synergy2, then Cost1 >= Cost2 ??

            // Let's check logic consistency
            if (Math.floor(r1.score / 10000) === Math.floor(r2.score / 10000)) {
                if (r1.totalCost < r2.totalCost) {
                    console.error("[FAILURE] Same synergy score but lower cost is ranked higher!");
                } else {
                    console.log("[SUCCESS] Same synergy score, higher/equal cost is ranked higher.");
                }
            }
        }

    });

} catch (e) {
    console.error(e);
}
