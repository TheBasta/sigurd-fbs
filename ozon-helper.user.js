// ==UserScript==
// @name         WB + Ozon: понятные названия для сборщика
// @namespace    local.marketplaces.shortnames
// @version      1.2
// @description  Заменяет длинные названия на короткие понятные по артикулу. Для WB и Ozon.
// @author       You
// @match       
// https://seller.wildberries.ru/*
// @match        
//https://suppliers-shipment.wildberries.ru/*
// @match        
//https://*.wildberries.ru/*
// @match        https://seller.ozon.ru/*
// @match        
//https://*.ozon.ru/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// connect      raw.githubusercontent.com
// connect      github.io
// connect      jsdelivr.net
// @updateURL    https://home.bacq.ru:8443/_new/scripts/sigurd/ozon-helper.user.js
// @downloadURL  https://home.bacq.ru:8443/_new/scripts/sigurd/ozon-helper.user.js
// ==/UserScript==

(function () {
  'use strict';

  const DICTIONARY_URL = 'https://home.bacq.ru:8443/_new/scripts/sigurd/dictionary-ozon.json';
  const CACHE_TTL_SECONDS = 300;
  const HIGHLIGHT = true;

  let D = {};
  let dictionaryReady = false;

  function loadDictionary(callback) {
    try {
      const cached = sessionStorage.getItem('marketplaceHelperDict');
      if (cached) {
        const obj = JSON.parse(cached);
        if (Date.now() - obj.t < CACHE_TTL_SECONDS * 1000) {
          D = obj.d;
          dictionaryReady = true;
          console.log('[Helper] Словарь из кэша, позиций:', Object.keys(D).length);
          return callback();
        }
      }
    } catch (e) { /* ignore */ }

    GM_xmlhttpRequest({
      method: 'GET',
      url: DICTIONARY_URL,
      onload: function (response) {
        if (response.status !== 200) {
          console.error('[Helper] Ошибка загрузки словаря:', response.status);
          return callback();
        }
        try {
          D = JSON.parse(response.responseText);
          dictionaryReady = true;
          console.log('[Helper] Словарь загружен, позиций:', Object.keys(D).length);
          try {
            sessionStorage.setItem('marketplaceHelperDict', JSON.stringify({ t: Date.now(), d: D }));
          } catch (e) { /* ignore */ }
        } catch (e) {
          console.error('[Helper] Ошибка парсинга словаря:', e);
        }
        callback();
      },
      onerror: function (err) {
        console.error('[Helper] Ошибка сети:', err);
        callback();
      }
    });
  }

  function processNode(root) {
    if (!dictionaryReady) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    const seen = new Set();

    while ((n = walker.nextNode())) {
      // Ищем артикул (в ВБ это "Арт. 12345", в Озоне может быть просто цифры или другой формат)
      // Расширяем поиск: ищем любые 10-14 цифр подряд в тексте
      const textContent = n.nodeValue || '';
      const m = textContent.match(/(?:Арт\.\s*)?(\d{10,14})/); 
      if (!m) continue;

      const barcode = m[1];
      const clean = D[barcode];
      if (!clean) continue;
      if (seen.has(barcode)) continue;

      let p = n.parentElement;
      let titleEl = null;

      for (let i = 0; i < 8 && p; i++) {
        const candidates = p.querySelectorAll('*');
        for (const el of candidates) {
          if (el.children.length > 0) continue;
          if (el === n.parentElement) continue;
          const t = (el.textContent || '').trim();
          if (t.length < 15 || t.length > 200) continue;
          if (/Арт\.|₽|р-р|Sigurd/i.test(t)) continue;
          if (!/[А-Яа-я]/.test(t)) continue;
          titleEl = el;
          break;
        }
        if (titleEl) break;
        p = p.parentElement;
      }

      if (titleEl) {
        // ВАЖНО: Проверяем, не равно ли текущее название нашему короткому.
        // Если React его сбросил, текст будет длинным, и мы применим замену снова.
        if (titleEl.textContent.trim() !== clean) {
          titleEl.dataset.wbRenamed = '1';
          titleEl.dataset.wbOriginal = titleEl.textContent;
          titleEl.textContent = clean;

          if (HIGHLIGHT) {
            titleEl.style.fontWeight = '700';
            titleEl.style.background = '#fff3a8';
            titleEl.style.padding = '2px 6px';
            titleEl.style.borderRadius = '4px';
            titleEl.style.display = 'inline-block';
          }
        }
        seen.add(barcode);
      }
    }
  }

  // ===================================================================
  // БОЕВАЯ ЛОГИКА ДЛЯ ОЗОНА И ВБ
  // ===================================================================

  function startObserver() {
    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        // Если добавились новые элементы
        m.addedNodes.forEach((nd) => {
          if (nd.nodeType === 1) processNode(nd);
        });
        // Если React изменил текст внутри существующего элемента
        if (m.type === 'characterData') {
          processNode(m.target.parentElement);
        }
      }
    });

    // Следим за добавлением узлов, поддеревом и ИЗМЕНЕНИЕМ ТЕКСТА
    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      characterData: true 
    });
  }

  loadDictionary(() => {
    processNode(document.body);
    startObserver();

    // "Тяжелая артиллерия" для Озона. 
    // Раз в секунду проверяем страницу. Если Озон стер наши названия - возвращаем обратно.
    // Это незаметно для глаза, но надежно защищает от сброса.
    setInterval(() => {
      processNode(document.body);
    }, 1000); 
  });
})();