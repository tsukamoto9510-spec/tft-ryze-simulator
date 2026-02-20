let lockedSet = new Set();
let bannedSet = new Set();

function initUI() {
    const selects = document.querySelectorAll('.trait-select');
    const options = Object.entries(traitMap).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    selects.forEach(s => s.innerHTML = options);

    const champList = document.getElementById('champList');
    if (champList) {
        champList.innerHTML = champions.map(c => `<option value="${c.name}">`).join('');
    }

    // Attach event listeners to initial static elements if not handling in main.js purely
    // But since this is initUI, we can set up the global hooks or internal listeners here.

    // Assign global functions for inline HTML event handlers (temporary compatibility or replacement)
    // Creating global wrappers if we want to support existing HTML without modifying it too much,
    // BUT the plan is to clean HTML. So we will attach listeners programmatically in `bindEvents`.
}

function bindEvents() {
    document.querySelector('button.add').addEventListener('click', addRequirement);
    document.querySelector('button.lock-btn').addEventListener('click', () => manageChamp('lock'));
    document.querySelector('button.ban-btn').addEventListener('click', () => manageChamp('ban'));
    document.querySelector('button.search').addEventListener('click', handleSearch);

    // Delegate remove button for requirements
    document.getElementById('requirements').addEventListener('click', (e) => {
        if (e.target.classList.contains('remove')) {
            e.target.parentElement.remove();
        }
    });

    // We can also export these or just bind them.
}

function addRequirement() {
    const div = document.createElement('div');
    div.className = 'input-group';
    div.innerHTML = `<select class="trait-select">${Object.entries(traitMap).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input type="number" class="trait-count" value="1" min="1"><span>体以上</span>
        <button class="remove">×</button>`; // Removed onclick, handled by delegation or separate bind

    // If not using delegation, bind click here:
    // div.querySelector('.remove').onclick = ...

    document.getElementById('requirements').appendChild(div);
}

function manageChamp(type) {
    const input = document.getElementById('champInput');
    const champ = champions.find(c => c.name === input.value);
    if (!champ) return;
    if (type === 'lock') {
        if (!bannedSet.has(champ)) lockedSet.add(champ);
    } else {
        if (!lockedSet.has(champ)) bannedSet.add(champ);
    }
    input.value = "";
    renderTags();
}

function renderTags() {
    const container = document.getElementById('tagContainer');
    container.innerHTML = '';
    lockedSet.forEach(c => container.appendChild(createTag(c, 'locked')));
    bannedSet.forEach(c => container.appendChild(createTag(c, 'banned')));
}

function createTag(c, type) {
    const div = document.createElement('div');
    div.className = `tag ${type}`;
    div.innerHTML = `${type === 'locked' ? '★' : ''}${c.name} <button>×</button>`;
    div.querySelector('button').onclick = () => {
        type === 'locked' ? lockedSet.delete(c) : bannedSet.delete(c);
        renderTags();
    };
    return div;
}

async function handleSearch() {
    const maxLvl = parseInt(document.getElementById('maxLevel').value);
    const reqs = Array.from(document.querySelectorAll('#requirements .input-group')).map(g => ({
        trait: g.querySelector('.trait-select').value,
        target: parseInt(g.querySelector('.trait-count').value)
    }));

    if (lockedSet.size > maxLvl) return alert("固定数が多すぎます");

    document.getElementById('output').innerHTML = "検索中...";

    // await logic
    const results = await search(maxLvl, reqs, lockedSet, bannedSet, champions);
    display(results);
}

function display(res) {
    const out = document.getElementById('output');
    out.innerHTML = res.length ? "" : "見つかりませんでした。";
    res.forEach(r => {
        const counts = {};
        r.team.forEach(c => c.traits.forEach(t => counts[t] = (counts[t] || 0) + 1));
        const traitHtml = Object.entries(counts).map(([t, c]) => {
            const active = c >= (traitRules[t]?.[0] || 2);
            return `<span class="trait-badge ${active ? 'trait-active' : 'trait-inactive'}">${traitMap[t] || t}: ${c}</span>`;
        }).join('');

        out.innerHTML += `<div class="result-card">
            <div class="team-meta">${r.team.length}体 / ${r.totalCost}G</div>
            <div class="champ-list">${r.team.map(c => {
            const costClass = c.cost >= 5 ? 'cost-5' : `cost-${c.cost}`;
            const lockIcon = c.locked ? '<span class="locked-icon">🔒</span>' : '';
            return `<span class="${costClass}">${lockIcon}${c.name}</span>`;
        }).join(" / ")}</div>
            <div>${traitHtml}</div>
        </div>`;
    });
}
