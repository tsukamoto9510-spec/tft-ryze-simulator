const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFile(filename) {
    // Correct path relative to where script is run
    return fs.readFileSync(path.join(__dirname, 'js', filename), 'utf8');
}

// Load data and logic into a sandbox
const sandbox = {
    console: console,
    setTimeout: (cb, ms) => cb(), // Mock setTimeout to run immediately
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

    // Remove 'const' to ensure global access or just concatenate
    // Concatenating is safer for shared scope of const/let in VM
    const fullScript = dataScript + '\n' + logicScript;

    vm.runInContext(fullScript, sandbox);

    // Test Setup
    const maxLevel = 9;

    // Simulate complex requirement
    // Ionia(3), Shurima(3), Bruiser(2), Invoker(2)
    // This should trigger enough combinatorial complexity
    // Adjust reqs to match valid traits
    const reqs = [
        { trait: "Ionia", target: 3 },
        { trait: "Shurima", target: 3 },
        { trait: "Bruiser", target: 2 },
        { trait: "Invoker", target: 2 }
    ];

    // Emulate Set for locked/banned
    const lockedSet = new Set();
    const bannedSet = new Set();

    // Get champions array from sandbox
    const champions = sandbox.champions;

    console.log(`Starting Benchmark...`);
    console.log(`Level: ${maxLevel}`);
    console.log(`Reqs: ${JSON.stringify(reqs)}`);

    const start = process.hrtime();

    // Call search in sandbox
    // search(maxLevel, reqs, lockedSet, bannedSet, champions)
    // Need to pass Sets into sandbox context or just use them if function accepts external objects (it does)
    // However, `instanceof Set` inside `logic.js` might fail if context differs, 
    // but logic.js uses duck typing or simple methods mostly.
    // Actually logic.js uses `lockedSet.has`, which works fine across contexts usually if object is passed.
    // But to be safe, let's create Sets inside sandbox or just pass them.

    sandbox.search(maxLevel, reqs, lockedSet, bannedSet, champions).then(results => {
        const end = process.hrtime(start);
        const timeInMs = (end[0] * 1000 + end[1] / 1e6);

        console.log(`\nResults Found: ${results.length}`);
        if (results.length > 0) {
            console.log(`Top Score: ${results[0].score}`);
            // Check first result
            const topTeam = results[0].team;
            console.log(`Top Team: ${topTeam.map(c => c.name).join(', ')}`);
        }
        console.log(`\nExecution Time: ${timeInMs.toFixed(2)} ms`);
    });

} catch (e) {
    console.error(e);
}
