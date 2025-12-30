// ==UserScript==
// @name         京东自动采集工具 (远程加载版)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  核心逻辑从 GitHub 远程加载，方便维护和更新
// @author       YourName
// @match        *://order.jd.com/center/list.action*
// @match        *://details.jd.com/normal/item.action*
// @match        *://order.jd.com/center/item.action*
// @grant        GM_setClipboard
// @grant        window.closev
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @require      https://cdn.jsdelivr.net/gh/windyyong/open_tool@main/youhou/common/tampermonkey_common.js
// @require      https://cdn.jsdelivr.net/gh/windyyong/open_tool@main/jd/youhou/download_order.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.15/lodash.min.js
//
// ==/UserScript==
