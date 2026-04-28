// One-time script to inspect CommunityDragon TFT data structure
// Makes a single HTTP request to the public CDN
const https = require('https');

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('Fetching CommunityDragon TFT data (1 request)...');
    const data = await fetchJSON('https://raw.communitydragon.org/latest/cdragon/tft/en_us.json');
    
    // Show top-level keys
    console.log('\n=== Top-level keys ===');
    console.log(Object.keys(data));
    
    // Check for sets structure
    if (data.sets) {
        console.log('\n=== Sets available ===');
        for (const [key, val] of Object.entries(data.sets)) {
            const champCount = val.champions ? val.champions.length : 0;
            const traitCount = val.traits ? val.traits.length : 0;
            console.log(`  ${key}: name="${val.name || val.mutator || '?'}", champions=${champCount}, traits=${traitCount}`);
        }
    }
    
    if (data.setData) {
        console.log('\n=== SetData available ===');
        for (const [key, val] of Object.entries(data.setData)) {
            const champCount = val.champions ? val.champions.length : 0;
            const traitCount = val.traits ? val.traits.length : 0;
            console.log(`  ${key}: name="${val.name || val.mutator || '?'}", champions=${champCount}, traits=${traitCount}`);
        }
    }
    
    // If setData exists, show a sample champion and trait from the latest set
    const setsObj = data.sets || data.setData;
    if (setsObj) {
        const keys = Object.keys(setsObj).sort();
        const latestKey = keys[keys.length - 1];
        const latest = setsObj[latestKey];
        console.log(`\n=== Sample from latest set (${latestKey}) ===`);
        if (latest.champions && latest.champions[0]) {
            console.log('Sample champion:', JSON.stringify(latest.champions[0], null, 2));
        }
        if (latest.traits && latest.traits[0]) {
            console.log('Sample trait:', JSON.stringify(latest.traits[0], null, 2));
        }
    }
}

main().catch(console.error);
