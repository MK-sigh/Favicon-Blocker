// --- 設定・状態管理 ---
let allowedSites = [];
let blockMode = 'placeholder';
let lastClickedElement = null; // 右クリック位置記憶

// URLごとにブロック状態を記憶（再問い合わせ防止）
const checkedUrls = new Map(); // url -> boolean (isBlocked)

const safeExecute = (func) => { try { func(); } catch (e) {} };

// --- 初期化 ---
const init = () => {
  loadSettings();

  // 右クリック位置の記録
  document.addEventListener('contextmenu', (e) => {
    lastClickedElement = e.target;
  }, true);

  // 監視と定期実行
  const observer = new MutationObserver((mutations) => {
    if (!init.debounceTimer) {
      init.debounceTimer = setTimeout(() => {
        // ボタン表示処理(processUI)は削除しました
        safeExecute(processBlocking); // 画像判定＆ブロックのみ実行
        init.debounceTimer = null;
      }, 500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(() => {
    safeExecute(processBlocking);
  }, 2000);
};

const loadSettings = () => {
  chrome.storage.local.get(['allowedSites', 'blockMode'], (result) => {
    allowedSites = result.allowedSites || [];
    blockMode = result.blockMode || 'placeholder';
    safeExecute(processBlocking);
  });
};

// メッセージ受信
chrome.runtime.onMessage.addListener((message) => {
  // ブロックリスト更新通知が来たら再チェック
  if (message.type === "BLOCK_UPDATED") {
    checkedUrls.clear(); // キャッシュクリア
    processBlocking();
    alert("ブロックしました。\n（見た目が同じファビコンは全て消えます）");
  }

  // 右クリックメニューからの依頼
  if (message.type === "CONTEXT_BLOCK_REQUEST") {
    handleContextBlockRequest();
  }
});

// 許可リスト判定用関数（これは必要なので残す）
const isUrlAllowed = (url) => {
  const lower = url.toLowerCase();
  return allowedSites.some(site => {
    const s = site.trim().toLowerCase();
    return s && lower.includes(s);
  });
};

// =================================================================
//  【処理2】 ブロック実行 (機能) - バックグラウンドへ問い合わせ
// =================================================================
const processBlocking = () => {
  const images = document.querySelectorAll('img');
  const urlsToCheck = [];

  // 未チェックの画像URLを収集
  images.forEach(img => {
    if (!img.src) return;
    // 大きすぎる画像は除外（ファビコンのみ対象）
    if (img.width > 60 || img.height > 60) return;
    
    if (!checkedUrls.has(img.src)) {
      urlsToCheck.push(img.src);
      // とりあえずfalseを入れておく（重複リクエスト防止）
      checkedUrls.set(img.src, false);
    }
  });

  if (urlsToCheck.length === 0) {
    // 未チェックがなくても、既存の判定結果に基づいてDOM更新は行う
    applyBlockingToDom();
    return;
  }

  // バックグラウンドに一括問い合わせ
  chrome.runtime.sendMessage({ type: "CHECK_IMAGES", urls: urlsToCheck }, (response) => {
    if (!response) return;
    
    // 結果を保存
    for (const [url, isBlocked] of Object.entries(response)) {
      checkedUrls.set(url, isBlocked);
    }
    // DOMに反映
    applyBlockingToDom();
  });
};

// 判定結果に基づいて実際に隠す
const applyBlockingToDom = () => {
  const images = document.querySelectorAll('img');
  
  images.forEach(img => {
    if (!img.src) return;
    
    // ブロック対象でなければスキップ
    if (!checkedUrls.get(img.src)) return;

    // 許可リストの再確認
    const anchor = img.closest('a');
    if (anchor && isUrlAllowed(anchor.href)) return;

    // 巻き添え防止の範囲計算
    const safeContainer = findSafeBlockContainer(img);
    if (safeContainer) {
      applyBlockOverlay(safeContainer, img.src);
    }
  });
};

// --- ヘルパー関数群 ---

const findClosestCard = (el) => {
    return el.closest('.g, .MjjYud, .Uk95Uc, [data-hveid]') || el.parentElement.parentElement;
};

const findFaviconImage = (container) => {
    if (!container) return null;
    let img = container.querySelector('img.XNo5Ab, img.D72XLc, .H9lube img, .uo4vr img');
    if (!img) {
        const imgs = container.querySelectorAll('img');
        for (const i of imgs) {
            if (i.src && i.width >= 10 && i.width <= 50 && i.height >= 10 && i.height <= 50) {
                const r = i.width/i.height;
                if(r>0.8 && r<1.2) return i;
            }
        }
    }
    return img;
};

// 巻き添え防止：H3が複数あったらストップ
const findSafeBlockContainer = (imgElement) => {
    let current = imgElement.parentElement;
    let safe = current; 
    for(let i=0; i<6; i++) {
        if(!current || current === document.body) break;
        if (current.querySelectorAll('h3').length > 1) break;
        
        if (current.classList.contains('g') || current.classList.contains('MjjYud')) {
            safe = current;
        } else {
            safe = current;
        }
        current = current.parentElement;
    }
    return safe;
};

// オーバーレイ適用
const applyBlockOverlay = (element, displayUrl) => {
  if (element.querySelector('.fb-blocked-overlay')) return;
  
  if (blockMode === 'hidden') {
    element.style.display = 'none';
  } else {
    element.classList.add('fb-blocked-placeholder');
    element.style.position = 'relative';
    element.style.overflow = 'hidden'; 
    element.style.borderRadius = '8px';

    const overlay = document.createElement('div');
    overlay.className = 'fb-blocked-overlay';
    overlay.innerHTML = `
      <div class="fb-blocked-msg-content">
         <img src="${displayUrl}" style="width:16px; height:16px; opacity:0.5; filter:grayscale(100%);"> 
         <span>ブロック済み</span>
      </div>
    `;
    
    element.appendChild(overlay);
  }
};

// 右クリック経由の処理
const handleContextBlockRequest = () => {
    const container = findClosestCard(lastClickedElement);
    if (!container) { alert("枠が見つかりません"); return; }
    
    const img = findFaviconImage(container);
    if (!img) { alert("ファビコンが見つかりません"); return; }
    
    if(confirm('このファビコン（見た目が同じもの全て）をブロックしますか？')) {
        chrome.runtime.sendMessage({
          type: "ADD_BLOCK_HASH",
          url: img.src
        });
    }
};

init();