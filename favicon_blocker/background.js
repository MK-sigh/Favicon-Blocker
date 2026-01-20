// メモリ内キャッシュ（URL -> ハッシュ値）
const hashCache = new Map();

// --- 右クリックメニュー作成 ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "block-favicon-image",
    title: "🚫 このファビコン（見た目）をブロック",
    contexts: ["image"]
  });
});

// --- 画像データから「指紋(Hash)」を作成する関数 ---
async function getImageHash(url) {
  if (hashCache.has(url)) return hashCache.get(url);

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    
    // SHA-256でハッシュ化
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    hashCache.set(url, hashHex);
    return hashHex;
  } catch (error) {
    console.error("画像取得エラー:", error);
    return null;
  }
}

// --- メッセージ処理 ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. ページ内の画像URLリストを受け取り、ブロック対象か判定して返す
  if (message.type === "CHECK_IMAGES") {
    (async () => {
      const { blockedHashes } = await chrome.storage.local.get('blockedHashes');
      const blockedSet = new Set(blockedHashes || []);
      const results = {};

      await Promise.all(message.urls.map(async (url) => {
        const hash = await getImageHash(url);
        if (hash && blockedSet.has(hash)) {
          results[url] = true;
        }
      }));

      sendResponse(results);
    })();
    return true; // 非同期レスポンス用
  }

  // 2. ブロック登録リクエスト
  if (message.type === "ADD_BLOCK_HASH") {
    (async () => {
      const hash = await getImageHash(message.url);
      if (hash) {
        const { blockedHashes } = await chrome.storage.local.get('blockedHashes');
        const newSet = new Set(blockedHashes || []);
        newSet.add(hash);
        await chrome.storage.local.set({ blockedHashes: Array.from(newSet) });
        
        // ★修正: タブIDが有効な場合のみ通知を送る
        if (sender.tab && sender.tab.id >= 0) {
          chrome.tabs.sendMessage(sender.tab.id, { type: "BLOCK_UPDATED" })
            .catch(() => {}); // エラー無視
        }
      }
    })();
    return true;
  }
});

// --- 右クリックメニュー処理 ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "block-favicon-image") {
    // ★修正: タブIDが有効な場合のみ送信
    if (tab && tab.id >= 0) {
      chrome.tabs.sendMessage(tab.id, {
        type: "CONTEXT_BLOCK_REQUEST",
        srcUrl: info.srcUrl
      }).catch((e) => {
        console.warn("メッセージ送信失敗:", e);
      });
    } else {
      console.warn("有効なタブIDが見つかりません");
    }
  }
});