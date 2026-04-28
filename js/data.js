// ===========================================
// TFT Set Manager - セット管理・切り替え
// ===========================================

// 利用可能なセットの定義
// data_setXX.js が読み込まれていれば自動登録される
const SETS = {};
const SET_LABELS = {};

function registerSet(id, label, data) {
    SETS[id] = data;
    SET_LABELS[id] = label;
}

// Set 17 (最新)
if (typeof SET17_DATA !== 'undefined') {
    registerSet('set17', 'Set 17 - Space Gods', SET17_DATA);
}
// Set 16
if (typeof SET16_DATA !== 'undefined') {
    registerSet('set16', 'Set 16 - ライズ (Ruination Rising)', SET16_DATA);
}
// Set 15
if (typeof SET15_DATA !== 'undefined') {
    registerSet('set15', 'Set 15', SET15_DATA);
}
// Set 14
if (typeof SET14_DATA !== 'undefined') {
    registerSet('set14', 'Set 14', SET14_DATA);
}
// Set 13
if (typeof SET13_DATA !== 'undefined') {
    registerSet('set13', 'Set 13 - Into the Arcane', SET13_DATA);
}
// Set 7
if (typeof SET7_DATA !== 'undefined') {
    registerSet('set7', 'Set 7 - Dragonlands', SET7_DATA);
}
// Set 5
if (typeof SET5_DATA !== 'undefined') {
    registerSet('set5', 'Set 5 - Reckoning', SET5_DATA);
}
// Set 4
if (typeof SET4_DATA !== 'undefined') {
    registerSet('set4', 'Set 4 - Fates', SET4_DATA);
}
// Set 3
if (typeof SET3_DATA !== 'undefined') {
    registerSet('set3', 'Set 3 - Galaxies', SET3_DATA);
}
// Set 1
if (typeof SET1_DATA !== 'undefined') {
    registerSet('set1', 'Set 1', SET1_DATA);
}
// --- 以下のセットは Community Dragon にデータなし（将来追加可能）---
// Set 2, 6, 8, 9, 10, 11, 12

// 現在のアクティブセット
let currentSet = null;

// グローバル変数（logic.js / ui.js で参照される）
let traitMap = {};
let traitRules = {};
let champions = [];

// 最新セット（数字が一番大きいもの）をデフォルトにする
function getLatestSetId() {
    const setIds = Object.keys(SETS);
    if (setIds.length === 0) return null;
    return setIds.sort((a, b) => {
        const numA = parseInt(a.replace('set', ''));
        const numB = parseInt(b.replace('set', ''));
        return numB - numA; // 降順
    })[0];
}

// セット切り替え
function switchSet(setId) {
    if (!SETS[setId]) {
        console.error(`Set "${setId}" is not loaded.`);
        return;
    }

    currentSet = setId;
    const d = SETS[setId];
    traitMap = d.traitMap;
    traitRules = d.traitRules;
    champions = d.champions;

    // 検索キャッシュをクリア
    optimizedDataCache = null;

    // Lock/Ban をリセット
    lockedSet.clear();
    bannedSet.clear();

    // UIを再初期化
    initUI();
    renderTags();
    document.getElementById('output').innerHTML = '';

    // ドロップダウンの選択状態を更新
    const selector = document.getElementById('setSelector');
    if (selector) {
        selector.value = setId;
    }

    // タイトルを更新
    const label = SET_LABELS[setId] || setId;
    document.querySelector('h2').textContent = `TFT 特性シミュレーター - ${label}`;
}

// セットセレクタのオプションを生成
function populateSetSelector() {
    const selector = document.getElementById('setSelector');
    if (!selector) return;

    selector.innerHTML = '';

    // セットを番号の降順（最新が上）でソート
    const sortedIds = Object.keys(SETS).sort((a, b) => {
        const numA = parseInt(a.replace('set', ''));
        const numB = parseInt(b.replace('set', ''));
        return numB - numA;
    });

    sortedIds.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = SET_LABELS[id] || id;
        selector.appendChild(opt);
    });
}
