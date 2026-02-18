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

    console.log("Testing Ionia 2 Search...");
    const reqs = [{ trait: "Ionia", target: 2 }];

    sandbox.search(maxLevel, reqs, lockedSet, bannedSet, champions).then(results => {
        console.log(`Found ${results.length} results.`);

        // Check for Yone & Yasuo
        const yoneYasuo = results.find(r => {
            const names = r.team.map(c => c.name);
            return names.includes("ヨネ") && names.includes("ヤスオ");
        });

        // Check for Shen & Wukong
        const shenWukong = results.find(r => {
            const names = r.team.map(c => c.name);
            return names.includes("シェン") && names.includes("ウーコン");
        });

        if (yoneYasuo) {
            console.log("[FOUND] Yone & Yasuo found in results.");
            console.log(`  Score: ${yoneYasuo.score}, Cost: ${yoneYasuo.totalCost}`);
        } else {
            console.log("[MISSING] Yone & Yasuo NOT found in results.");
        }

        if (shenWukong) {
            console.log("[FOUND] Shen & Wukong found in results.");
            console.log(`  Score: ${shenWukong.score}, Cost: ${shenWukong.totalCost}`);
        } else {
            console.log("[MISSING] Shen & Wukong NOT found in results.");
        }

        // Show top 5
        console.log("Top 5 Results:");
        results.slice(0, 5).forEach((r, i) => {
            console.log(`#${i + 1} [Cost: ${r.totalCost}] ${r.team.map(c => c.name).join(", ")}`);
        });
    });

} catch (e) {
    console.error(e);
}
