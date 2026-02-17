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
    const lockedSet = new Set(); // We will lock Baron
    const bannedSet = new Set();
    const maxLevel = 8;

    // Find Baron
    const baron = champions.find(c => c.name === "バロンナッシャー");
    if (!baron) {
        console.error("Baron Nashor not found in champions data!");
        process.exit(1);
    }
    lockedSet.add(baron);

    // Goal: Get Void 8.
    // Baron gives 2. We need 6 more.
    // Available Voids aside from Baron:
    // Kog'Maw (1), Cho'Gath (2), Rek'Sai (2), Malzahar (3), Bel'Veth (4), Kai'Sa (4), Rift Herald (5)
    // Total 7 other Voids.
    // If we lock Baron (2 slots, 2 Void), we have 6 slots left.
    // We need 6 more Voids.
    // So we should see a team of 7 units (Baron + 6 others).
    // Total slots: 2 (Baron) + 6 (others) = 8.
    // Total Void: 2 (Baron) + 6 (others) = 8.

    const reqs = [{ trait: "Void", target: 8 }];

    console.log(`Testing Baron Logic...`);
    console.log(`Locking: ${baron.name} (Slots: ${baron.slots || 1}, Traits: ${JSON.stringify(baron.traitCounts)})`);
    console.log(`Req: Void >= 8`);
    console.log(`Max Level: ${maxLevel}`);

    sandbox.search(maxLevel, reqs, lockedSet, bannedSet, champions).then(results => {
        if (results.length === 0) {
            console.log("No results found.");
            return;
        }

        const team = results[0].team;
        console.log(`\nTop Team found (Score: ${results[0].score}):`);
        team.forEach(c => {
            console.log(`- ${c.name} (Cost: ${c.cost}, Slots: ${c.slots || 1})`);
        });

        const totalSlots = team.reduce((sum, c) => sum + (c.slots || 1), 0);
        const totalVoid = team.reduce((sum, c) => {
            let count = 1;
            if (c.traitCounts && c.traitCounts["Void"]) count = c.traitCounts["Void"];
            else if (c.traits.includes("Void")) count = 1;
            else count = 0;
            return sum + count;
        }, 0);

        console.log(`\nTotal Units: ${team.length}`);
        console.log(`Total Slots: ${totalSlots} (Expected <= ${maxLevel})`);
        console.log(`Total Void Count: ${totalVoid} (Expected >= 8)`);

        if (totalSlots <= maxLevel && totalVoid >= 8 && team.includes(baron)) {
            console.log("\nSUCCESS: Baron logic verified.");
        } else {
            console.log("\nFAILURE: Logic invalid.");
        }
    });

} catch (e) {
    console.error(e);
}
