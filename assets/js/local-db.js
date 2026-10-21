/*
 * LocalDB — 本機離線資料庫
 * ------------------------------------------------------------------
 * 用瀏覽器的 localStorage 取代 Firebase Realtime Database，
 * 介面刻意做成和 Firebase 相同 (ref / on('value') / push / child / update / set / remove)，
 * 所以原本的摸彩程式邏輯幾乎不用改。
 *
 * - 資料只存在「這台電腦、這個瀏覽器」裡，完全不需要網路。
 * - 同一台電腦開兩個視窗 (例如：投影幕顯示大螢幕、操作者看後台)，資料會自動同步。
 * - 提供 downloadBackup() / restoreFromFile() 做 JSON 備份與還原。
 */
(function (global) {
    'use strict';

    // 不同版本 (完整版 / 單抽獎版) 可設定 window.LOCALDB_PREFIX 讓資料互不干擾
    const STORAGE_PREFIX = global.LOCALDB_PREFIX || 'senshado_offline_v1:';
    const ROOTS = global.LOCALDB_ROOTS || ['senshado_participants', 'senshado_prizes'];

    const cache = {};          // root -> object | null
    const listeners = {};      // root -> [callback]
    const pending = new Set(); // roots waiting to notify
    let storageWarned = false;

    function storageKey(root) { return STORAGE_PREFIX + root; }

    function load(root) {
        try {
            const raw = global.localStorage.getItem(storageKey(root));
            cache[root] = raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('[LocalDB] 讀取失敗，改用記憶體暫存：', e);
            if (!(root in cache)) cache[root] = null;
        }
        if (cache[root] && typeof cache[root] === 'object' && Object.keys(cache[root]).length === 0) {
            cache[root] = null;
        }
    }

    function save(root) {
        try {
            if (cache[root] == null) global.localStorage.removeItem(storageKey(root));
            else global.localStorage.setItem(storageKey(root), JSON.stringify(cache[root]));
        } catch (e) {
            console.error('[LocalDB] 寫入失敗：', e);
            if (!storageWarned) {
                storageWarned = true;
                alert('⚠️ 無法將資料寫入本機儲存空間（可能是無痕視窗或瀏覽器設定阻擋）。\n本次資料仍可使用，但關閉視窗後會遺失，請記得用「備份」下載資料。');
            }
        }
    }

    function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }

    function scheduleNotify(root) {
        pending.add(root);
        if (pending.size === 1) {
            Promise.resolve().then(() => {
                const roots = Array.from(pending);
                pending.clear();
                roots.forEach(notifyNow);
            });
        }
    }

    function notifyNow(root) {
        (listeners[root] || []).forEach(cb => {
            const snapshotData = clone(cache[root]);
            try { cb({ val: () => snapshotData, exists: () => snapshotData != null }); }
            catch (e) { console.error(e); }
        });
    }

    function commit(root) {
        if (cache[root] && Object.keys(cache[root]).length === 0) cache[root] = null;
        save(root);
        scheduleNotify(root);
        return Promise.resolve();
    }

    // 可依時間排序的 ID (類似 Firebase push key)
    let lastTime = 0, seq = 0;
    function newId() {
        const now = Date.now();
        seq = (now === lastTime) ? seq + 1 : 0;
        lastTime = now;
        const rand = Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
        return 'L' + now.toString(36).padStart(9, '0') + seq.toString(36).padStart(2, '0') + rand;
    }

    class Ref {
        constructor(root, key) { this.root = root; this.key = key || null; }

        child(key) { return new Ref(this.root, String(key)); }

        on(event, cb) {
            if (event !== 'value' || this.key) throw new Error('LocalDB 只支援根節點的 value 監聽');
            if (!(this.root in cache)) load(this.root);
            (listeners[this.root] = listeners[this.root] || []).push(cb);
            const data = clone(cache[this.root]);
            Promise.resolve().then(() => cb({ val: () => data, exists: () => data != null }));
            return cb;
        }

        push(value) {
            const id = newId();
            this.child(id).set(value);
            const r = this.child(id);
            r.then = (res) => Promise.resolve(r).then(res);
            return r;
        }

        set(value) {
            const root = this.root;
            if (!this.key) { cache[root] = clone(value); return commit(root); }
            if (value == null) return this.remove();
            cache[root] = cache[root] || {};
            cache[root][this.key] = clone(value);
            return commit(root);
        }

        update(values) {
            const root = this.root;
            if (!this.key) {
                cache[root] = Object.assign(cache[root] || {}, clone(values));
                return commit(root);
            }
            cache[root] = cache[root] || {};
            cache[root][this.key] = Object.assign({}, cache[root][this.key] || {}, clone(values));
            return commit(root);
        }

        remove() {
            const root = this.root;
            if (!this.key) cache[root] = null;
            else if (cache[root]) delete cache[root][this.key];
            return commit(root);
        }
    }

    // 其他視窗 (同一台電腦) 修改資料時自動同步
    global.addEventListener('storage', (e) => {
        if (!e.key || !e.key.startsWith(STORAGE_PREFIX)) return;
        const root = e.key.slice(STORAGE_PREFIX.length);
        if (!ROOTS.includes(root)) return;
        load(root);
        scheduleNotify(root);
    });

    // 公平亂數：使用瀏覽器內建的密碼學等級亂數 (避免取餘數偏差)
    function randomInt(n) {
        if (!(n > 0)) return 0;
        if (global.crypto && global.crypto.getRandomValues) {
            const max = Math.floor(0x100000000 / n) * n;
            const buf = new Uint32Array(1);
            do { global.crypto.getRandomValues(buf); } while (buf[0] >= max);
            return buf[0] % n;
        }
        return Math.floor(Math.random() * n);
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function downloadBackup() {
        ROOTS.forEach(r => { if (!(r in cache)) load(r); });
        const payload = {
            app: 'senshado-lottery-offline',
            version: 1,
            exportedAt: new Date().toISOString(),
            data: {}
        };
        ROOTS.forEach(r => { payload.data[r] = clone(cache[r]); });
        const d = new Date();
        const name = `摸彩備份_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function restoreFromFile(file) {
        return file.text().then(text => {
            let payload;
            try { payload = JSON.parse(text); } catch (e) { throw new Error('檔案不是有效的 JSON 備份檔'); }
            if (!payload || payload.app !== 'senshado-lottery-offline' || !payload.data) {
                throw new Error('這不是摸彩系統的備份檔');
            }
            ROOTS.forEach(r => {
                const v = payload.data[r];
                cache[r] = (v && typeof v === 'object') ? v : null;
                commit(r);
            });
        });
    }

    global.LocalDB = {
        database: () => ({ ref: (path) => new Ref(String(path)) }),
        randomInt,
        downloadBackup,
        restoreFromFile
    };
})(window);
