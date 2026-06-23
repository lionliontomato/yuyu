const SHEET_ID = '1C477RELlpLyT_bDDonVgI6BFLG__E_axqWu_AwA915Q';
const SHEET_GID = '0';

let songs = [];
let tags = [];
let activeTag = null;
let query = '';
let sheetTimeout = null;

const palette = [
  ['#5cc9f5','#edfaff'],['#77e0dc','#effdfc'],['#3bb7e8','#e8f8ff'],
  ['#7bb8ff','#edf5ff'],['#8fd6ff','#eef9ff'],['#64d2c8','#effcfb'],
  ['#ffb38f','#fff4ec'],['#7ad6f7','#ecfbff'],['#9ddcff','#f0faff'],
  ['#66c7ee','#ecf9ff'],['#54bfe3','#e9f8ff'],['#a7e9ff','#f3fcff']
];

function cell(row, i) {
  const c = row && row.c ? row.c[i] : null;
  return c ? String(c.f || c.v || '').trim() : '';
}

function normalize(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, '');
}

function parseTags(text) {
  return String(text || '')
    .replace(/[｜|／\/;；、，\n\r]/g, ',')
    .split(',')
    .map(function(t) { return t.trim(); })
    .filter(function(t) { return t && t !== '-' && t !== '—' && t !== '標籤'; });
}

function findColumn(headers, names, fallback) {
  const keys = names.map(normalize);
  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i]);
    if (keys.includes(h)) return i;
  }
  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i]);
    if (keys.some(function(k) { return h.includes(k); })) return i;
  }
  return fallback;
}

function exactSetting(settings, keys, fallback) {
  for (let i = 0; i < keys.length; i++) {
    if (settings[keys[i]]) return settings[keys[i]];
  }
  return fallback;
}

function getSettings(rows) {
  // 與原版模板一致：H 欄是設定名稱、I 欄是設定內容。
  // 不再做模糊表頭判斷，避免「網站小標題」被誤判成「網站標題」。
  const settingsMap = {};
  rows.forEach(function(row) {
    const key = cell(row, 7);   // H 欄
    const value = cell(row, 8); // I 欄
    if (key && value) settingsMap[key] = value;
  });

  // 固定列備援：使用者目前的表格 I2 = 網站標題、I3 = 網站小標題。
  const i2 = rows[1] ? cell(rows[1], 8) : '';
  const i3 = rows[2] ? cell(rows[2], 8) : '';

  return {
    title: exactSetting(settingsMap, ['網站標題', '標題名稱', '歌單名稱', '主標題'], i2 || '魚魚の歌單'),
    subtitle: exactSetting(settingsMap, ['網站小標題', '網站副標題', '副標題', '介紹文字', '說明文字'], i3 || '走過路過歡迎一起來聽首歌吧。'),
    randomText: exactSetting(settingsMap, ['隨機抽歌按鈕', '抽歌按鈕文字', '隨機按鈕文字'], '隨機抽歌'),
    searchPlaceholder: exactSetting(settingsMap, ['搜尋提示文字', '搜尋框提示', '搜尋 placeholder'], '搜尋歌名、歌手或分類…'),
    emptyText: exactSetting(settingsMap, ['找不到歌曲提示', '空白提示', '無資料提示'], '沒有找到符合條件的歌曲'),
    modalTitle: exactSetting(settingsMap, ['抽歌視窗標題', '彈窗標題', '推薦視窗標題'], '魚魚推薦'),
    closeText: exactSetting(settingsMap, ['關閉按鈕文字', '關閉按鈕', '視窗按鈕文字', '彈窗按鈕文字'], '好聽愛聽'),
    footer1: exactSetting(settingsMap, ['版權第一行', '頁尾第一行', 'footer1', 'copyright1'], '© 2026 LionLionTomato. All Rights Reserved.'),
    footer2: exactSetting(settingsMap, ['版權第二行', '頁尾第二行', 'footer2', 'copyright2'], '本網站係由作者本人原創之歌單網站架構延伸製作。'),
    footer3: exactSetting(settingsMap, ['版權第三行', '頁尾第三行', 'footer3', 'copyright3'], '本網站內容、版面設計與程式架構未經授權不得重製、改作或商業使用。')
  };
}

function applySiteSettings(rows) {
  const settings = getSettings(rows);
  const siteTitle = document.getElementById('siteTitle');
  const siteSubtitle = document.getElementById('siteSubtitle');
  const modalTitleEl = document.getElementById('modalTitle');
  const closeModal = document.getElementById('closeModal');
  const randomBtn = document.getElementById('randomBtn');
  const search = document.getElementById('search');
  const empty = document.getElementById('empty');
  const footer1 = document.getElementById('footer1');
  const footer2 = document.getElementById('footer2');
  const footer3 = document.getElementById('footer3');

  if (siteTitle) siteTitle.textContent = settings.title;
  if (siteSubtitle) siteSubtitle.textContent = settings.subtitle;
  if (modalTitleEl) modalTitleEl.textContent = settings.modalTitle;
  if (closeModal) closeModal.textContent = settings.closeText;
  if (randomBtn) randomBtn.textContent = settings.randomText;
  if (search) search.placeholder = settings.searchPlaceholder;
  if (empty) empty.textContent = settings.emptyText;
  if (footer1) footer1.textContent = settings.footer1;
  if (footer2) footer2.textContent = settings.footer2;
  if (footer3) footer3.textContent = settings.footer3;
  document.title = settings.title;
}

function loadSheet() {
  const status = document.getElementById('status');
  status.textContent = '讀取中…';
  const oldScript = document.getElementById('sheetJsonp');
  if (oldScript) oldScript.remove();

  const callbackName = 'playlistSheetCallback_' + Date.now();
  const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?gid=' + SHEET_GID + '&tqx=out:json;responseHandler:' + callbackName + '&t=' + Date.now();

  window[callbackName] = function(response) {
    clearTimeout(sheetTimeout);
    try {
      const rows = response && response.table && response.table.rows ? response.table.rows : [];
      const headers = rows[0] && rows[0].c ? rows[0].c.map(function(_, i) { return cell(rows[0], i); }) : [];

      applySiteSettings(rows);

      const titleIdx = findColumn(headers, ['歌名', '歌曲', '曲名', 'title'], 0);
      const artistIdx = findColumn(headers, ['歌手', '演唱', '藝人', 'artist'], 1);
      const tagIdx = findColumn(headers, ['標籤', '歌曲標籤', '分類標籤'], -1);
      const categoryIdx = tagIdx >= 0 ? tagIdx : findColumn(headers, ['分類', '歌曲分類', '類型', 'category'], 2);
      const linkIdx = findColumn(headers, ['歌曲連結', '連結', 'link', 'url'], -1);

      const loadedSongs = [];
      const masterTags = [];

      rows.slice(1).forEach(function(row) {
        const title = cell(row, titleIdx);
        const artist = cell(row, artistIdx);
        const category = cell(row, categoryIdx);
        const link = linkIdx >= 0 ? cell(row, linkIdx) : '';
        const looksLikeHeader = ['歌名', '歌曲', '曲名', 'title'].includes(title.toLowerCase());

        if (title && !looksLikeHeader) {
          parseTags(category).forEach(function(t) { masterTags.push(t); });
          loadedSongs.push({
            title: title,
            artist: artist || '未填歌手',
            category: category || '未分類',
            link: /^https?:\/\//i.test(link) ? link : ''
          });
        }
      });

      songs = loadedSongs;
      tags = Array.from(new Set(masterTags));
      if (!tags.length) {
        const fromSongs = [];
        songs.forEach(function(s) { parseTags(s.category).forEach(function(t) { fromSongs.push(t); }); });
        tags = Array.from(new Set(fromSongs));
      }

      status.textContent = '';
      renderTags();
      renderSongs();
    } catch (err) {
      console.error(err);
      showSheetError('試算表格式解析失敗，請確認歌名、歌手、標籤欄位是否存在。');
    } finally {
      delete window[callbackName];
      const s = document.getElementById('sheetJsonp');
      if (s) s.remove();
    }
  };

  const script = document.createElement('script');
  script.id = 'sheetJsonp';
  script.src = url;
  script.onerror = function() {
    clearTimeout(sheetTimeout);
    showSheetError('讀取不到試算表，請確認共用權限是「知道連結的任何人可檢視」。');
    delete window[callbackName];
  };
  document.body.appendChild(script);

  sheetTimeout = setTimeout(function() {
    showSheetError('讀取試算表逾時，請重新整理頁面或確認試算表權限。');
    delete window[callbackName];
  }, 12000);
}

function showSheetError(message) {
  songs = [];
  tags = [];
  document.getElementById('status').textContent = message;
  renderTags();
  renderSongs();
}

function renderTags() {
  const box = document.getElementById('tags');
  box.innerHTML = '';
  tags.forEach(function(t, i) {
    const colors = palette[i % palette.length];
    const b = document.createElement('button');
    b.className = 'tag' + (activeTag === t ? ' active' : '');
    b.textContent = t;
    b.style.setProperty('--tag', colors[0]);
    b.style.setProperty('--tagLight', colors[1]);
    b.onclick = function() {
      activeTag = activeTag === t ? null : t;
      renderTags();
      renderSongs();
    };
    box.appendChild(b);
  });
}

function matchSong(s) {
  const q = query.trim().toLowerCase();
  const categories = parseTags(s.category);
  const text = (s.title + ' ' + s.artist + ' ' + s.category).toLowerCase();
  const tagOk = !activeTag || categories.includes(activeTag) || s.artist === activeTag || s.category.includes(activeTag);
  return tagOk && (!q || text.includes(q));
}

function renderSongs() {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const count = document.getElementById('count');
  grid.innerHTML = '';
  const list = songs.filter(matchSong);
  count.textContent = '共 ' + list.length + ' 首 / 全部 ' + songs.length + ' 首';
  empty.style.display = list.length ? 'none' : 'block';

  list.forEach(function(s) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.title = s.title;

    const title = document.createElement('h3');
    title.className = 'song';
    title.textContent = s.title;

    const artist = document.createElement('div');
    artist.className = 'artist';
    artist.textContent = s.artist;

    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = parseTags(s.category).join(' ') || '未分類';

    const copy = document.createElement('button');
    copy.className = 'copy';
    copy.type = 'button';
    copy.textContent = '複製';
    copy.onclick = async function() {
      const text = s.title + ' - ' + s.artist;
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      copy.textContent = '✓ 已複製';
      copy.classList.add('done');
      setTimeout(function() {
        copy.textContent = '複製';
        copy.classList.remove('done');
      }, 1300);
    };

    card.append(title, artist, cat, copy);
    if (s.link) {
      card.addEventListener('dblclick', function() { window.open(s.link, '_blank', 'noopener,noreferrer'); });
      card.title = '雙擊開啟歌曲連結';
    }
    grid.appendChild(card);
  });
}

document.getElementById('search').addEventListener('input', function(e) {
  query = e.target.value;
  renderSongs();
});

document.getElementById('randomBtn').onclick = function(e) {
  e.preventDefault();
  const list = songs.filter(matchSong);
  if (!list.length) return;
  const s = list[Math.floor(Math.random() * list.length)];
  document.getElementById('pickSong').textContent = s.title;
  document.getElementById('pickArtist').textContent = s.artist + '｜' + (parseTags(s.category).join(' ') || '未分類');
  document.getElementById('modal').classList.add('show');
};

document.getElementById('closeModal').onclick = function() {
  document.getElementById('modal').classList.remove('show');
};

document.getElementById('modal').onclick = function(e) {
  if (e.target.id === 'modal') {
    e.currentTarget.classList.remove('show');
  }
};

(function floats() {
  const symbols = ['🐟','🐠','🫧','✨','🌊','🐚','♡'];
  const layer = document.getElementById('floatLayer');
  for (let i = 0; i < 42; i++) {
    const el = document.createElement('span');
    el.className = 'float';
    el.textContent = symbols[i % symbols.length];
    el.style.setProperty('--left', Math.random() * 100 + '%');
    el.style.setProperty('--dur', (10 + Math.random() * 16) + 's');
    el.style.setProperty('--delay', (-Math.random() * 18) + 's');
    layer.appendChild(el);
  }
})();

loadSheet();
