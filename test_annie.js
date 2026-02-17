const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFile(filename) {
    return fs.readFileSync(path.join(__dirname, 'js', filename), 'utf8');
}

const sandbox = {
    console: console,
    setTimeout: (cb, ms) => cb(),
    Set: Set,
    Map: Map,
    Array: Array,
    Object: Object,
    Promise: Promise
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
    const maxLevel = 8;

    // Find Annie & Tibbers
    const annie = champions.find(c => c.name === "アニー＆ティバーズ");
    if (!annie) {
        console.error("Annie & Tibbers not found in champions data!");
        process.exit(1);
    }
    lockedSet.add(annie);

    // Goal: Get Arcanist 6 using Annie & Tibbers
    // Annie & Tibbers gives 2. We need 4 more.

    const reqs = [{ trait: "Arcanist", target: 6 }];

    console.log(`Testing Annie & Tibbers Logic...`);
    console.log(`Locking: ${annie.name} (Slots: ${annie.slots}, Traits: ${JSON.stringify(annie.traitCounts)})`);
    console.log(`Req: Arcanist >= 6`);

    sandbox.search(maxLevel, reqs, lockedSet, bannedSet, champions).then(results => {
        if (results.length === 0) {
            console.log("No results found.");
            return;
        }

        const team = results[0].team;
        console.log(`\nTop Team found:`);
        team.forEach(c => {
            // Handle undefined slots/counts for display
            const slots = c.slots || 1;
            const arcanistCount = (c.traitCounts && c.traitCounts["Arcanist"]) ? c.traitCounts["Arcanist"] : (c.traits.includes("Arcanist") ? 1 : 0);
            console.log(`- ${c.name} (Slots: ${slots}, Arcanist: ${arcanistCount})`);
        });

        const totalSlots = team.reduce((sum, c) => sum + (c.slots || 1), 0);
        const totalArcanist = team.reduce((sum, c) => {
            let count = 0;
            if (c.traitCounts && c.traitCounts["Arcanist"]) count = c.traitCounts["Arcanist"];
            else if (c.traits.includes("Arcanist")) count = 1;
            return sum + count;
        }, 0);

        console.log(`\nTotal Slots: ${totalSlots} (Expected <= ${maxLevel})`);
        console.log(`Total Arcanist Count: ${totalArcanist} (Expected >= 6)`);

        if (totalSlots <= maxLevel && totalArcanist >= 6 && team.includes(annie)) {
            console.log("\nSUCCESS: Annie & Tibbers logic verified.");
        } else {
            console.log("\nFAILURE: Logic invalid.");
        }
    });

} catch (e) {
    console.error(e);
}
