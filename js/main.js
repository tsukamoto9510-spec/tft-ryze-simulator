document.addEventListener('DOMContentLoaded', () => {
    // セットセレクタを初期化
    populateSetSelector();

    // 最新セットをデフォルトで選択・適用
    const latestSet = getLatestSetId();
    if (latestSet) {
        switchSet(latestSet);
    }

    // イベントリスナーをバインド
    bindEvents();
});
