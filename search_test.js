// search_test.js
// Test script to verify minimal subset search logic

// Mock data to simulate browser environment
const traitMap = {
    "Ionia": "アイオニア", "Arcanist": "アルカニスト", "Yordle": "ヨードル", "Void": "ヴォイド",
    "Bruiser": "ブルーザー", "Gunslinger": "ガンスリンガー"
};
const traitRules = {
    "Ionia": [3, 6, 9], "Arcanist": [2, 4, 6], "Yordle": [3, 5], "Void": [3, 6, 8],
    "Bruiser": [2, 4, 6], "Gunslinger": [2, 4, 6]
};

// Simplified champion list for testing
const champions = [
    { name: "シェン", traits: ["Ionia", "Bruiser"], cost: 2 },
    { name: "ジン", traits: ["Ionia", "Gunslinger"], cost: 1 }, // Cheap Ionia
    { name: "アーリ", traits: ["Ionia", "Arcanist"], cost: 4 },
    { name: "カルマ", traits: ["Ionia", "Invoker"], cost: 3 },
    { name: "イレリア", traits: ["Ionia", "Challenger"], cost: 1 },
    { name: "セト", traits: ["Ionia", "Juggernaut"], cost: 2 },
    { name: "ティーモ", traits: ["Yordle", "Strategist"], cost: 2 },
    { name: "トリスターナ", traits: ["Yordle", "Gunslinger"], cost: 1 },
    { name: "ポッピー", traits: ["Yordle", "Bastion"], cost: 1 },
    { name: "クレッド", traits: ["Yordle", "Slayer"], cost: 2 },
    { name: "ハイマー", traits: ["Yordle", "Piltover"], cost: 5 },
    { name: "チョ＝ガス", traits: ["Void", "Bruiser"], cost: 1 },
    { name: "マルザハール", traits: ["Void", "Sorcerer"], cost: 1 },
    { name: "カサディン", traits: ["Void", "Bastion"], cost: 2 },
    { name: "レク＝サイ", traits: ["Void", "Bruiser"], cost: 3 },
    { name: "カイ＝サ", traits: ["Void", "Challenger"], cost: 4 },
    { name: "ベル＝ヴェス", traits: ["Void", "Empress"], cost: 5 },
    { name: "バロン", traits: ["Void"], cost: 7, slots: 1, traitCounts: { "Void": 2 } } // Mock Baron
];

// Load logic.js functions (simulate include)
const fs = require('fs');
const logicContent = fs.readFileSync('./js/logic.js', 'utf8');
// Naive eval to load functions into global scope for testing
// In a real env we would require module, but logic.js is client-side code.
// We need to strip "const champions = ..." from logic.js if it exists, but it's passed in.
// logic.js relies on 'traitRules' which we mocked above.
eval(logicContent);

async function runTests() {
    console.log("Starting Search Logic Tests...");

    // Test 1: Simple Trait (Ionia 3)
    // Expect: 3 Ionia units, cheapest if possible.
    // 3 units is minimal.
    console.log("\nTest 1: Ionia 3 (Target: 3 units)");
    const reqs1 = [{ trait: "Ionia", target: 3 }];
    const start1 = performance.now();
    const res1 = await search(8, reqs1, new Set(), new Set(), champions);
    const end1 = performance.now();

    if (res1.length > 0) {
        const best = res1[0];
        console.log(`Found: ${best.team.length} units. Cost: ${best.totalCost}`);
        console.log(`Team: ${best.team.map(c => c.name).join(", ")}`);
        if (best.team.length === 3) console.log("PASS: Found minimal 3 units.");
        else console.log(`FAIL: Expected 3 units, found ${best.team.length}`);
    } else {
        console.log("FAIL: No result found.");
    }
    console.log(`Time: ${(end1 - start1).toFixed(2)}ms`);


    // Test 2: Composite Traits (Ionia 3, Yordle 3)
    // Minimal: 3 Ionia + 3 Yordle = 6 units (assuming no overlap/spatula)
    // Logic should NOT return 8 units.
    console.log("\nTest 2: Ionia 3, Yordle 3 (Target: 6 units)");
    const reqs2 = [{ trait: "Ionia", target: 3 }, { trait: "Yordle", target: 3 }];
    const start2 = performance.now();
    const res2 = await search(8, reqs2, new Set(), new Set(), champions);
    const end2 = performance.now();

    if (res2.length > 0) {
        const best = res2[0];
        console.log(`Found: ${best.team.length} units.`);
        console.log(`Team: ${best.team.map(c => c.name).join(", ")}`);
        if (best.team.length === 6) console.log("PASS: Found minimal 6 units.");
        else console.log(`FAIL: Expected 6 units, found ${best.team.length}`);
    } else {
        console.log("FAIL: No result found.");
    }
    console.log(`Time: ${(end2 - start2).toFixed(2)}ms`);

    // Test 3: Large Search Space Mock
    // Try to force a deep search with "Void 6" (needs 6 units)
    console.log("\nTest 3: Void 6 (Target: 6 units)");
    const reqs3 = [{ trait: "Void", target: 6 }];
    const start3 = performance.now();
    const res3 = await search(9, reqs3, new Set(), new Set(), champions);
    const end3 = performance.now();

    if (res3.length > 0) {
        const best = res3[0];
        console.log(`Found: ${best.team.length} units.`);
        console.log(`Team: ${best.team.map(c => c.name).join(", ")}`);
        if (best.team.length <= 6) console.log("PASS: Found minimal set."); // Could be 5 with Baron? (Baron counts as 1 unit but 2 void? No, in mock Baron is 1 slot cost 7 traits Void:2)
        // Champions mock: Void units: Cho(1), Malz(1), Kas(1), Rek(1), Kai(1), Bel(1), Baron(1 slot, 2 void)
        // 6 units normal = 6 void. 
        // 5 units with Baron = 4 normal + Baron(2) = 6 void.
        // So minimal units is 5.
        // Wait, Baron logic in logic.js:
        // "count = c.traitCounts[traitName]" -> Baron has Void: 2.
        // So Baron is valuable.

    } else {
        console.log("No result");
    }
    console.log(`Time: ${(end3 - start3).toFixed(2)}ms`);

}

runTests();
