// ==UserScript==
// @name           Universal ALT Text Viewer
// @icon           data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📝</text></svg>
// @description    Display and copy ALT text (alternative text) for images, GIFs, and videos on Twitter, Bluesky, and TOKIMEKI.
// @description:ja Twitter, Bluesky, TOKIMEKIの画像、GIF、動画のALTテキスト（代替テキスト）を表示・コピーします。
// @namespace      https://bsky.app/profile/neon-ai.art
// @homepage       https://github.com/neon-aiart
// @version        3.4
// @author         ねおん
// @match          https://twitter.com/*
// @match          https://x.com/*
// @match          https://bsky.app/*
// @match          https://tokimeki.blue/*
// @match          https://tokimekibluesky.vercel.app/*
// @match          http://localhost:5173/*
// @grant          GM_addStyle
// @run-at         document-idle
// @license        PolyForm Noncommercial 1.0.0; https://polyformproject.org/licenses/noncommercial/1.0.0/
// ==/UserScript==

/**
 * ==============================================================================
 * IMPORTANT NOTICE / 重要事項
 * ==============================================================================
 * ⛄ Copyright (c) 2025-2026 ねおん (Neon)
 * Licensed under the PolyForm Noncommercial License 1.0.0.
 * * [JP] 本スクリプトは個人利用・非営利目的でのみ使用・改変が許可されます。
 * 無断転載、作者名の書き換え、およびクレジットの削除は固く禁じます。
 * 本スクリプトを改変・配布（フォーク）する場合は、必ず元の作者名（ねおん）
 * およびこのクレジット表記を維持してください。
 * * [EN] This script is licensed for personal and non-commercial use only.
 * Unauthorized re-uploading, modification of authorship, or removal of
 * author credits is strictly prohibited. If you fork this project, you MUST
 * retain the original credits and authorship.
 * ==============================================================================
 * 🫧 Icon Libraries & Licenses:
 * - Heroicons (MIT): https://heroicons.com
 *   - ©️ 2026 Tailwind Labs, Inc.: https://github.com/tailwindlabs/heroicons/blob/master/LICENSE
============================================================================== -->
 */

(function() {
    'use strict';

    const SCRIPT_VERSION = '3.4';

    const MINIMUM_CHARACTER_LENGTH = 5; // 最低文字数

    const DEBUG = false;
    let lastLoggedPost = null; // 直近にログを出力した post 要素を保持
    const DEBUG_STRUCTURE = false;
    if (DEBUG) console.log(`[${getDateTimeFormats().display}] 📝 Universal ALT Text Viewer v${SCRIPT_VERSION}: デバッグモード`);

    // 除外ALTテキスト
    const localizedImageStrings = [
        "画像", "Image", "圖片", "이미지", "Imagen", "Bild",
        "Immagine", "Imagem", "Foto", "Rasm", "Kép", "zdjęcie",
        "埋め込み動画", "埋め込みビデオプレーヤー",
    ];

    // NGワード
    const TEXTS_TO_REMOVE_REGEX = [
        /^Alt:\s*/i, // 先頭の "Alt: "
        /^\/\/Character\n1girl,\nBREAK\n\/\/Fashions\n/i, // 先頭のプロンプト定型文
    ];

    /*
     * --- プラットフォーム設定の解説 ---
     * root: 監視の起点となる要素（ポスト全体など）。ここに追加があったら中身をスキャンする。
     * targets: 対象となる画像/動画の設定リスト。
     *   - containerSelector: [必須] ALTボタンを設置する親要素（コンテナ）。
     *                        :has() や > を使って「ALTを持つ要素の親」を特定する。
     *                        ボタンはここに appendChild される。
     *   - textSelector:      [任意] コンテナ内部で実際に代替テキストを持っている要素。
     *                        省略時は containerSelector 自身から属性を探す。
     *   - attr:              [必須] 取得する属性名 ('alt', 'aria-label', 'innerText'など)。
     *                        'innerText' を指定すると属性ではなくタグの中身を取得する。
     *   - position:          ボタンの表示位置
     */
    const platformConfigs = [ {
        name: 'Twitter/X',
        hostnames: ['twitter.com', 'x.com',],
        root: 'article[data-testid="tweet"], div[aria-labelledby="modal-header"]',
        targets: [ {
            containerSelector: 'div[data-testid="tweetPhoto"][aria-label]',
            textSelector: '', // コンテナ自身を対象にするので空文字にする
            attr: 'aria-label',
            position: 'top: 12px; left: 12px;',
        }, {
            containerSelector: 'div[data-testid="tweetPhoto"]:has(video[aria-label])',
            textSelector: 'video[aria-label]',
            attr: 'aria-label',
            position: 'top: 12px; left: 12px;',
        }, {
            // modal 用
            containerSelector: 'div[aria-label]:has(> img[alt])',
            textSelector: '',
            attr: 'aria-label',
            position: 'top: 12px; left: 12px;',
        }, ], }, {
        name: 'Bluesky',
        hostnames: ['bsky.app',],
        root: 'div[data-testid*="-by-"], div[role="link"]:has(div[data-testid="userAvatarImage"])',
        targets: [ {
            // 画像: [data-expoimage] を利用し、アバターを弾く
            containerSelector: 'div[data-expoimage]:has(img[alt])',
            textSelector: 'img[alt]',
            attr: 'alt',
            position: 'bottom: 10px; left: 10px;',
        }, {
            // GIFステッカー
            containerSelector: 'div:has(> video[aria-label])',
            textSelector: 'video[aria-label]',
            attr: 'aria-label',
            position: 'bottom: 30px; right: 10px;',
        }, {
            // GIF・動画
            containerSelector: 'div[aria-label]:has(video):has(figcaption)',
            textSelector: 'figcaption',
            attr: 'innerText',
            position: 'bottom: 60px; right: 10px;',
        }, ], }, {
        name: 'TOKIMEKI',
        hostnames: ['tokimeki.blue', 'tokimekibluesky.vercel.app', 'localhost',],
        // root: 各表示エリアの外枠
        root: 'article.timeline__item, article.notifications-item, dialog.media-content-wrap',
        targets: [ {
            containerSelector: [
                // タイムライン: warnなし
                'div.timeline-images-wrap:not(:has(> div.timeline-warn)) div.timeline-images div.timeline-image:has(button > img[alt])',
                // 通知カラム: warnなし
                'div.notifications-item-images:not(:has(> div.timeline-warn)) div.timeline-images div.timeline-image:has(button > img[alt])',
                // タイムライン・通知カラム: warn＆hideあり
                'div.timeline-warn.timeline-warn--hide ~ div.timeline-images div.timeline-image:has(button > img[alt])',
                // タイムライン（カルーセル）
                'div.timeline-images-carousel__slide:has(button > img[alt])',
                // モーダル（１枚）: warnなし
                'div.media-content__image:not(:has(> div.timeline-warn)) div.single-image:has(> img[alt])',
                // モーダル（１枚）: warn＆hideあり
                'div.timeline-warn.timeline-warn--hide ~ div.single-image:has(> img[alt])',
                // モーダル（複数枚）
                'div.embla__slide:has(> img[alt])',
            ].join(', '),
            textSelector: 'img[alt]',
            attr: 'alt',
            position: 'bottom: 40px; left: 10px;',
        }, {
            // GIFステッカー
            containerSelector: 'div.timeline-external--tenor:has(video.gif-video)',
            textSelector: 'p.timeline-external__description',
            attr: 'innerText',
            position: 'bottom: 10px; right: 10px;',
        }, {
            // GIF・動画
            containerSelector: 'div.timeline-video-wrap:has(video), div.timeline-video-wrap:has(.video-player)',
            textSelector: '',
            attr: 'alt',
            position: 'bottom: 60px; right: 10px;',
        }, ],
    }, ];

    const currentPlatform = platformConfigs.find(p => p.hostnames.some(h => window.location.hostname.includes(h)));
    if (!currentPlatform) return; // 対象外のURL

    // --- スタイル ---
    GM_addStyle(`
        /* コピーボタンのスタイル */
        .alt-button {
            position: absolute;
            z-index: 99;
            cursor: pointer;
            background-color: rgba(29, 155, 240, 0.9);
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            pointer-events: auto;
        }

        /* ツールチップ */
        .alt-tooltip {
            position: absolute;
            z-index: 10000;
            background-color: rgba(30, 30, 30, 0.95);
            top: 0;
            left: 0;
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            max-width: min(80%, 320px);
            max-height: min(72%, 480px);
            font-size: 14px;
            line-height: 1.4;
            visibility: hidden;
            opacity: 0;
            transition: opacity 0.2s ease;
            white-space: pre-wrap;
            overflow-wrap: break-word;
            overflow: auto;
            word-break: break-word;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            user-select: text; /* テキスト選択可能に */
            cursor: auto;
            pointer-events: auto;
        }

        /* ボタンホバー時、その親にあるリンクの反応を消す */
        .alt-button:hover {
            box-shadow:
                0 2px 5px rgba(0,0,0,0.3),  /* 元の影をそのまま記述 */
                0 0 0 1000px rgba(0,0,0,0); /* その後に判定用の透明な影を足す */
            background-color: rgba(29, 155, 240, 1.0); /* ついでに色を少し濃くしてホバー感出すのもアリ */
        }
    `);

    // --- SVGアイコン定義 ---

    // 通常時のコピーアイコン
    const SVG_COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 18px; height: 18px; vertical-align: middle; display: inline-flex;"><path fill-rule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0 1 18 9.375v9.375a3 3 0 0 0 3-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 0 0-.673-.05A3 3 0 0 0 15 1.5h-1.5a3 3 0 0 0-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6ZM13.5 3A1.5 1.5 0 0 0 12 4.5h4.5A1.5 1.5 0 0 0 15 3h-1.5Z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 0 1 3 20.625V9.375ZM6 12a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V12Zm2.25 0a.75.75 0 0 1 .75-.75h3.75a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75ZM6 15a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V15Zm2.25 0a.75.75 0 0 1 .75-.75h3.75a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75ZM6 18a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V18Zm2.25 0a.75.75 0 0 1 .75-.75h3.75a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" /></svg>`;

    // 完了時のチェックマークアイコン
    const SVG_SUCCESS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3.5" stroke="currentColor" style="width: 18px; height: 18px; vertical-align: middle; display: inline-flex;"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>`;

    // --- メイン処理 ---

    /**
     * Dateオブジェクトから用途別のフォーマット済み文字列を生成するユーティリティ
     * @param {Date} dateObj - 対象のDateオブジェクト（指定がない場合は現在時刻）
     */
    function getDateTimeFormats(dateObj = new Date()) {
        const pad = (num) => num.toString().padStart(2, '0');
        const y = dateObj.getFullYear();
        const m = pad(dateObj.getMonth() + 1);
        const d = pad(dateObj.getDate());
        const h = pad(dateObj.getHours());
        const min = pad(dateObj.getMinutes());
        const s = pad(dateObj.getSeconds());

        return {
            // 1. コンソール出力や画面表示用 (2026/09/04 22:50:39)
            display: `${y}/${m}/${d} ${h}:${min}:${s}`,

            // 2. ファイル名用：OS禁止文字を除外 (20260904_225039)
            name: `${y}${m}${d}_${h}${min}${s}`,

            // 3. メタデータ/外部互換用 (ISO 8601 UTC)
            iso: dateObj.toISOString(),
        };
    }

    // 代替テキストの有無・妥当性を判定
    function isValidAltText(text) {
        if (!text) return false;
        const length = Math.min(Math.max(MINIMUM_CHARACTER_LENGTH, 1), 99);
        const trimmed = text.trim();
        return trimmed.length > length && !localizedImageStrings.includes(trimmed);
    }

    /**
     * 指定された要素からテキストを取得
     * @param {HTMLElement} element - 対象要素
     * @param {string} attr - 属性名 ('alt', 'aria-label', 'innerText')
     */
    function getAltText(element, attr) {
        if (!element) return null;
        let text = (attr === 'innerText')
            ? element.innerText
            : (element.getAttribute(attr) || '');

        // --- NGワード（正規表現）に一致する部分をすべて消去 ---
        TEXTS_TO_REMOVE_REGEX.forEach(regex => {
            text = text.replace(regex, '');
        });
        return text.trim();
    }

    // --- API Core (TOKIMEKI 動画用) ---
    async function fetchVideoAltForTokimeki(videoWrap) {
        const contentNode = videoWrap.closest('.timeline__content');
        const uri = contentNode?.dataset.aturi;
        if (!uri) return '';

        try {
            const apiUrl = `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=1`;
            const res = await fetch(apiUrl);
            if (!res.ok) return '';

            const data = await res.json();
            const post = data.thread?.post;
            if (DEBUG_STRUCTURE) console.log('[DEBUG] post.embed full structure:', JSON.stringify(post.embed, null, 2));

            // 動画のALTを優先的に、なければ埋め込みのALTを取得
            let altText =
                post.embed?.external?.title ||
                post.embed?.media?.external?.title ||
                post.embed?.media?.alt ||
                post.embed?.video?.alt ||
                post.embed?.alt || '';

            if (!altText && post.embed?.record) {
                const q = post.embed.record.embeds?.[0];
                if (q) {
                    altText =
                        q.external?.title ||
                        q.media?.external?.title ||
                        q.media?.alt ||
                        q.video?.alt ||
                        q.alt || '';
                }
            }

            return altText;
        } catch (e) {
            console.error('[ALT-Script] TOKIMEKI API Fetch Error:', e);
            return '';
        }
    }

    // コピーボタンを生成・設置
    function createAltButton(container, text, position) {
        // すでにボタンが存在する場合は null を返して処理を抜ける
        if (!container || container.querySelector('.alt-button')) return null;

        // モーダル（dialog）を判定
        const isInsideModal = container.closest('dialog');
        const appendTarget = isInsideModal ? isInsideModal : document.body;

        // コピーボタン作成
        const btn = document.createElement('div');
        btn.className = 'alt-button';
        btn.innerHTML = SVG_COPY_ICON;
        btn.style.cssText += position;

        // 正規表現で position から数値部分を抽出して clamp をかける
        const applyClamp = (prop) => {
            const match = position.match(new RegExp(`${prop}:\\s*([^;]+)`, 'i'));
            // 5pxから、(100% - ボタン幅35px)の間に収める
            if (match) btn.style[prop] = `clamp(5px, ${match[1]}, calc(100% - 35px))`;
        };
        ['top', 'bottom', 'left', 'right',].forEach(applyClamp);

        // ツールチップ作成
        const tip = document.createElement('div');
        tip.className = 'alt-tooltip';
        tip.textContent = text;

        // 判定に基づいたターゲットにアペンド
        appendTarget.appendChild(tip);

        let isHovering = { btn: false, tip: false, container: false, };

        const update = () => {
            // コンテナにマウスがあるならボタン表示
            btn.style.opacity = (isHovering.btn || isHovering.tip || isHovering.container) ? '1' : '0';

            // ボタンかチップにマウスがあるならチップ表示
            if (isHovering.btn || isHovering.tip) {
                tip.style.visibility = 'visible';
                tip.style.opacity = '1';

                // --- 座標計算のコア ---
                const rect = btn.getBoundingClientRect();

                if (isInsideModal) {
                    // モーダル内(dialog直下)の場合：dialogの画面上の位置を基準にオフセット計算
                    const modalRect = isInsideModal.getBoundingClientRect();

                    // ボタンがモーダルの上半分にあるか判定
                    const isTopArea = (rect.top - modalRect.top) < (modalRect.height / 2);

                    // 上下の位置調整（dialog内の相対位置に変換）
                    tip.style.top = isTopArea
                        ? (rect.bottom - modalRect.top + 2) + 'px'
                        : (rect.top - modalRect.top - tip.offsetHeight - 2) + 'px';

                    // 左右の位置調整
                    if (position.includes('left')) {
                        tip.style.left = (rect.left - modalRect.left) + 'px';
                    } else {
                        tip.style.left = (rect.right - modalRect.left - tip.offsetWidth) + 'px';
                    }
                } else {
                    // Body内(v2.5拡張方式)
                    const scrollY = window.scrollY;
                    const scrollX = window.scrollX;

                    // ボタンが画面の上半分にあるか判定
                    const isTopViewport = rect.top < (window.innerHeight / 2);

                    tip.style.top = isTopViewport
                        ? (rect.bottom + scrollY + 2) + 'px' // 下に出す
                        : (rect.top + scrollY - tip.offsetHeight - 2) + 'px'; // 上に出す

                    let leftPos = rect.right + scrollX - tip.offsetWidth;
                    tip.style.left = (leftPos < 10 ? 10 : leftPos) + 'px';
                }
            } else {
                setTimeout(() => {
                    if (!isHovering.btn && !isHovering.tip) {
                        tip.style.visibility = 'hidden';
                        tip.style.opacity = '0';
                    }
                }, 200); // 少し遅れて消す（マウス移動用）
            }
        };

        // イベントリスナー
        container.addEventListener('mouseenter', () => {
            isHovering.container = true;
            update();
        });
        container.addEventListener('mouseleave', () => {
            isHovering.container = false;
            update();
        });
        btn.addEventListener('mouseenter', () => {
            isHovering.btn = true;
            update();
        });
        btn.addEventListener('mouseleave', () => {
            isHovering.btn = false;
            update();
        });
        tip.addEventListener('mouseenter', () => {
            isHovering.tip = true;
            update();
        });
        tip.addEventListener('mouseleave', () => {
            isHovering.tip = false;
            update();
        });

        // 初期ホバー状態の判定
        if (container.matches(':hover')) isHovering.container = true;
        // 初期状態の表示を反映
        update();

        // コピー機能
        btn.addEventListener('click', (e) => {
            e.preventDefault();           // 1. デフォルトの挙動（リンク移動）を阻止
            e.stopPropagation();          // 2. 親要素への伝播を阻止
            e.stopImmediatePropagation(); // 3. 同じ要素に設定された他のリスナーも阻止
            navigator.clipboard.writeText(text).then(() => {
                btn.innerHTML = SVG_SUCCESS_ICON;
                setTimeout(() => {
                    btn.innerHTML = SVG_COPY_ICON;
                }, 2000);
            });
        }, { capture: true, }); // キャプチャリングフェーズで先に捕まえる

        container.appendChild(btn);
        console.log(`[ALT Viewer] Button added: ${text.replace(/\n/g, ' ').substring(0, 80)}...`);

        // 生成したボタン要素を返却する
        return btn;
    }

    // ポスト要素を解析し、ターゲットを探す
    async function processPost(post) {
        let isGroupOpened = false;

        try {
            // 現在の有効なコンテナをすべて取得
            const validContainers = currentPlatform.targets.flatMap(cfg =>
                Array.from(post.querySelectorAll(cfg.containerSelector))
            );

            // 対象外になった既存ボタンとツールチップを安全に削除
            const allExistingBtns = post.querySelectorAll('.alt-button');
            if (allExistingBtns.length > 0) {
                // DOM削除による MutationObserver の再発火を防ぐため一時的に停止
                observer.disconnect();

                allExistingBtns.forEach(btn => {
                    const parentContainer = btn.parentElement;
                    // プラットフォーム内の「どの有効コンテナ」にも含まれていなければ削除
                    if (parentContainer && !validContainers.includes(parentContainer)) {
                        btn.remove();
                        // 該当するツールチップも削除（dialog 内 または body から探す）
                        const modal = parentContainer.closest('dialog') || document.body;
                        modal.querySelectorAll('.alt-tooltip').forEach(tip => tip.remove());
                    }
                });

                // 削除完了後に監視を再開
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                });
            }

            // for...of ループを使うことで async/await とログの順序を完全に制御
            for (const cfg of currentPlatform.targets) {
                const containers = Array.from(post.querySelectorAll(cfg.containerSelector));

                for (const con of containers) {
                    if (!con) continue;

                    // --- 1. テキストと対象要素を取得 ---
                    let txt = '';
                    let el = null;

                    // TOKIMEKIかつ動画コンテナの場合のみ、属性をAPIから補完
                    if (currentPlatform.name === 'TOKIMEKI' && cfg.containerSelector.includes('.timeline-video-wrap')) {
                        if (!con.querySelector('video, .video-player') || con.dataset.fetching === 'true') continue;

                        // すでにALT属性にセットされているか確認
                        txt = con.getAttribute('alt') || '';
                        el = con; // 動画の場合はコンテナ自身

                        if (!isValidAltText(txt)) {
                            con.dataset.fetching = 'true';
                            txt = await fetchVideoAltForTokimeki(con);
                            if (isValidAltText(txt)) {
                                if (DEBUG) console.log(`[DEBUG] TOKIMEKI動画ALT取得成功: "${txt.substring(0, 30)}..."`);
                                con.setAttribute('alt', txt);
                            } else if (DEBUG) {
                                console.warn('[DEBUG] TOKIMEKI動画ALTの取得失敗または空データ', con);
                            }
                            con.dataset.fetching = 'false';
                        }
                    } else {
                        // 通常の画像・要素のテキスト取得
                        el = cfg.textSelector ? con.querySelector(cfg.textSelector) : con;
                        txt = getAltText(el, cfg.attr);
                    }

                    const existingBtn = con.querySelector('.alt-button');

                    // --- 2. バリデーションチェック（無効な場合はログを出さずにスキップ） ---
                    if (!isValidAltText(txt) || (con.offsetWidth > 0 && con.offsetWidth < 40)) {
                        if (existingBtn) existingBtn.remove();
                        continue;
                    }

                    // ログ出力（初回のみグループを開く）
                    if (DEBUG && lastLoggedPost !== post) {
                        if (!isGroupOpened) {
                            console.groupCollapsed(`[DEBUG] [${getDateTimeFormats().display}] 💫 processPost: ${post.tagName}.${post.className.split(' ')[0] || ''}`);
                            isGroupOpened = true;
                        }

                        console.log(` ➡️ [検出DOM] selector: "${cfg.containerSelector}"`, {
                            container: con,
                            targetElement: el,
                            attr: cfg.attr,
                            extractedText: txt,
                        });
                    }

                    // --- 3. ボタン作成・更新制御 ---
                    if (existingBtn && existingBtn.dataset.altText === txt) continue;

                    if (existingBtn) existingBtn.remove();

                    const btn = createAltButton(con, txt, cfg.position);
                    if (btn) btn.dataset.altText = txt;
                }
            }
        } finally {
            // グループが開かれていた場合のみ閉じ、キャッシュを更新
            if (isGroupOpened) {
                console.groupEnd();
                lastLoggedPost = post;
            }
        }
    }

    // --- 監視 ---
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            // 1. ノード追加（新しい投稿やスライド要素がDOMに挿入されたとき）
            if (m.type === 'childList') {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.matches && node.matches(currentPlatform.root)) {
                            processPost(node);
                        } else {
                            node.querySelectorAll(currentPlatform.root).forEach(processPost);
                        }
                    }
                });
            }
            // 2. 属性変更（画像が遅れて読み込まれたり、alt/srcが後から書き換わったとき）
            else if (m.type === 'attributes') {
                const targetEl = m.target;
                if (targetEl.nodeType === 1) {
                    const post = targetEl.closest(currentPlatform.root);
                    if (post) processPost(post);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,       // 要素の追加・削除を検知
        subtree: true,         // 子孫要素全体を対象にする
        attributes: true,      // 属性（srcやclassなど）の変更を検知
    });

    // 初期実行
    window.addEventListener('load', () => {
        setTimeout(() => document.querySelectorAll(currentPlatform.root).forEach(processPost), 1000);
    });
})();