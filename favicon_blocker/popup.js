document.addEventListener('DOMContentLoaded', () => {
  const allowedList = document.getElementById('allowedList');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBlockedBtn');
  const status = document.getElementById('status');
  const radios = document.getElementsByName('mode');
  const blockedListEl = document.getElementById('blockedList');

  // データ読み込みと描画
  const loadData = () => {
    chrome.storage.local.get(['blockedFavicons', 'allowedSites', 'blockMode'], (result) => {
      // 許可リスト
      if (result.allowedSites) {
        allowedList.value = result.allowedSites.join('\n');
      }
      
      // モード選択
      const mode = result.blockMode || 'placeholder';
      for (const radio of radios) {
        if (radio.value === mode) radio.checked = true;
      }

      // ブロックリスト描画
      renderBlockedList(result.blockedFavicons || []);
    });
  };

  // ブロックリストのHTML生成
  const renderBlockedList = (favicons) => {
    blockedListEl.innerHTML = '';
    
    if (favicons.length === 0) {
      blockedListEl.innerHTML = '<div class="empty-msg">ブロック中のファビコンはありません</div>';
      return;
    }

    favicons.forEach(url => {
      const li = document.createElement('li');
      li.className = 'blocked-item';
      
      const img = document.createElement('img');
      img.src = url;
      img.title = url; // マウスホバーでURL表示
      
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'ブロック解除';
      
      // 個別削除イベント
      delBtn.addEventListener('click', () => {
        removeFavicon(url);
      });

      li.appendChild(img);
      li.appendChild(delBtn);
      blockedListEl.appendChild(li);
    });
  };

  // 個別削除処理
  const removeFavicon = (urlToDelete) => {
    chrome.storage.local.get(['blockedFavicons'], (result) => {
      const current = result.blockedFavicons || [];
      const newList = current.filter(url => url !== urlToDelete);
      chrome.storage.local.set({ blockedFavicons: newList }, () => {
        loadData(); // リスト再描画
      });
    });
  };

  // 設定保存ボタン
  saveBtn.addEventListener('click', () => {
    const sites = allowedList.value.split('\n').filter(s => s.trim() !== '');
    let selectedMode = 'placeholder';
    for (const radio of radios) {
      if (radio.checked) selectedMode = radio.value;
    }

    chrome.storage.local.set({
      allowedSites: sites,
      blockMode: selectedMode
    }, () => {
      status.style.display = 'inline';
      setTimeout(() => { status.style.display = 'none'; }, 2000);
    });
  });

  // 全消去ボタン
  clearBtn.addEventListener('click', () => {
    if (confirm('ブロックリストを全て空にしますか？')) {
      chrome.storage.local.set({ blockedFavicons: [] }, () => {
        loadData();
      });
    }
  });

  // 初期実行
  loadData();
});