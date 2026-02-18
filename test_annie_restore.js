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

    console.log("Checking champions...");
    const annie = champions.find(c => c.name === "アニー");
    const annieTibbers = champions.find(c => c.name === "アニー＆ティバーズ");

    if (annie) {
        console.log(`[OK] Found Annie: Cost ${annie.cost}, Traits: ${JSON.stringify(annie.traits)}`);
    } else {
        console.error("[FAIL] Annie not found");
    }

    if (annieTibbers) {
        console.log(`[OK] Found Annie & Tibbers: Cost ${annieTibbers.cost}, Traits: ${JSON.stringify(annieTibbers.traits)}`);
    } else {
        console.error("[FAIL] Annie & Tibbers not found");
    }

    if (annie && annieTibbers) {
        console.log("\nSuccess: Both champions exist.");
    } else {
        console.error("\nFailure: One or both champions missing.");
        process.exit(1);
    }

} catch (e) {
    console.error(e);
}
