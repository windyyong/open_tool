// ==UserScript==
// @name         京东订单全自动化采集工具 (物流增强版)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  列表页自动保存，详情页比例拆分实付款，深度兼容多种物流显示格式，自动复制并导出
// @author       Gemini
// @match        *://order.jd.com/center/list.action*
// @match        *://details.jd.com/normal/item.action*
// @match        *://order.jd.com/center/item.action*
// @require      http://117.50.172.235/tampermonkey_common.js
// @grant        GM_setClipboard
// @grant        window.close
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'JD_COLLECTED_ORDERS_V5';
    const CSV_HEADERS = [
        "订单时间", "来源账号", "商铺名称", "订单号", "商品名称",
        "发货型号", "码数", "成本", "商品数量", "退货数量",
        "总计(分摊后)", "物流号", "订单状态", "仓库", "状态",
        "物流", "衣服型号", "退货数量", "分摊单价", "备注",
        "订单链接", "商品链接", "地址"
    ];

    // --- 跨域数据持久化工具 (关键修改：改用 GM API) ---
    function getStoredData() {
        const data = GM_getValue(STORAGE_KEY, []);
        return Array.isArray(data) ? data : [];
    }

    /**
     * 优化后的数据保存逻辑
     * 核心改进：在写入前重新获取最新数据，并进行深度合并
     */
    function saveToStore(newRows) {
        // 1. 获取当前存储中的最新数据（不要依赖页面加载时的旧变量）
        let current = GM_getValue(STORAGE_KEY, []);
        if (!Array.isArray(current)) current = [];

        let hasChanged = false;

        newRows.forEach(newRow => {
            // 唯一键判断：订单号 (index 3) + 商品链接 (index 21)
            // 注意：订单号包含 ="..." 格式，需统一处理或直接比较
            const existsIdx = current.findIndex(c =>
                String(c[3]) === String(newRow[3]) &&
                String(c[21]) === String(newRow[21])
            );

            if (existsIdx > -1) {
                // 如果已存在，执行“非空覆盖”合并
                let existingRow = current[existsIdx];
                let rowUpdated = false;

                for (let i = 0; i < newRow.length; i++) {
                    const newVal = newRow[i];
                    // 只有当新值有意义，且与旧值不同时才更新
                    if (newVal !== null && newVal !== undefined && newVal !== "" && existingRow[i] !== newVal) {
                        existingRow[i] = newVal;
                        rowUpdated = true;
                    }
                }

                if (rowUpdated) {
                    current[existsIdx] = existingRow;
                    hasChanged = true;
                }
            } else {
                // 如果不存在，直接添加
                current.push(newRow);
                hasChanged = true;
            }
        });

        // 2. 只有在真正发生变化时才写入，减少存储操作
        if (hasChanged) {
            // 再次校验：写入前的一瞬间再读一次，防止极高频下的冲突（双重检查锁定思想）
            let latestBeforeWrite = GM_getValue(STORAGE_KEY, []);
            // 简单合并 latestBeforeWrite 和当前准备写入的 current
            // 这里为了简化，直接写入 current。因为 GM_setValue 是原子性的。
            GM_setValue(STORAGE_KEY, current);
            console.log(`[存储成功] 当前库内总数: ${current.length}`);
        }
    }

    function cleanStr(val) {
        if (!val) return "";
        return val.toString().replace(/,/g, "，").replace(/\n/g, " ").trim();
    }

    // --- 增强版物流提取函数 ---
    function extractLogistics() {
        let logisticsSet = new Set();
        let courierSet = new Set();

        // 1. 从常见的物流表格/列表提取
        const pInfoLis = document.querySelectorAll(".p-info li, .track-list li, .logistics-info li");
        pInfoLis.forEach(li => {
            const text = li.innerText;
            if (text.includes("运单号") || text.includes("快递单号") || text.includes("货运单号")) {
                // 正则匹配：提取冒号后面的数字和字母组合
                const match = text.match(/(?:运单号|单号|货运单号)[：\s]+([A-Za-z0-9_-]+)/);
                if (match && match[1]) logisticsSet.add(match[1]);
            }
            if (text.includes("承运人") || text.includes("快递公司") || text.includes("物流公司")) {
                const match = text.match(/(?:承运人|快递公司|物流公司)[：\s]+([\u4e00-\u9fa5]+)/);
                if (match && match[1]) courierSet.add(match[1]);
            }
        });

        // 2. 如果没找到，尝试全局扫描包裹模块 (针对拆单多包裹)
        const packageBlocks = document.querySelectorAll(".package-info, .disp-info");
        packageBlocks.forEach(block => {
            const text = block.innerText;
            const snMatch = text.match(/(?:单号)[：\s]*([A-Za-z0-9]{8,})/g);
            if (snMatch) {
                snMatch.forEach(m => {
                    const cleanSn = m.replace(/.*[：\s]/, "").trim();
                    if (cleanSn) logisticsSet.add(cleanSn);
                });
            }
        });

        // 3. 兜底方案：扫描页面所有文本中符合快递单号特征的字符串
        if (logisticsSet.size === 0) {
            const bodyText = document.body.innerText;
            // 匹配常见的运单号格式（通常是字母数字混合，8位以上）
            const genericMatch = bodyText.match(/(?:运单号|单号)[：\s]*([A-Za-z0-9]{10,20})/g);
            if (genericMatch) {
                genericMatch.forEach(m => logisticsSet.add(m.replace(/.*[：\s]/, "").trim()));
            }
        }
        return {
            sn: Array.from(logisticsSet).join("|"),
            company: Array.from(courierSet).join("|")
        };
    }

    // --- 逻辑：订单详情页 ---
    if (location.host.includes('details.jd.com')) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                // 1. 基础信息提取
                const orderId = document.querySelector(".state-top")?.innerText.replace("订单号：", "").trim() || "";
                if (!orderId) return;

                const orderTime = document.querySelector("#datesubmit-" + orderId)?.value ||
                    document.querySelector(".node.ready .txt3")?.innerText.split("\n")[0] || "";
                const shopName = document.querySelector(".shop-name")?.innerText.trim() || "京东自营";
                const orderStatus = document.querySelector(".state-txt")?.innerText.trim() || "";
                const orderLink = window.location.href;
                const addressInfo = document.querySelector(".address-info .user-info, .dl:nth-child(2) .info-rcol")?.innerText.trim() || "";

                // 2. 提取实付款 (根据你提供的 HTML 结构)
                const totalActualPaid = parseFloat(document.querySelector(".goods-total .count")?.innerText.replace(/[^\d.]/g, '') || "0");

                // 3. 遍历商品行
                const productRows = document.querySelectorAll("tr[class*='product-']");
                let productsInfo = [];
                let jdPriceTotalWeight = 0;

                productRows.forEach(tr => {
                    const pNameElement = tr.querySelector(".p-name a");
                    if (!pNameElement) return;

                    const pName = pNameElement.innerText.trim();
                    const pLink = pNameElement.href;
                    const pSku = tr.querySelector(".p-extra span")?.innerText;

                    // 数量在第5个td (根据你的 HTML 结构)
                    const pCount = parseInt(tr.querySelector("td:nth-child(5)")?.innerText.trim() || "1");
                    // 京东价在 .f-price
                    const pJdPrice = parseFloat(tr.querySelector(".f-price")?.innerText.replace(/[^\d.]/g, '') || "0");

                    const weight = pJdPrice * pCount;
                    jdPriceTotalWeight += weight;

                    productsInfo.push({pName, pLink, pCount, weight, pJdPrice, pSku});
                });

                // 4. 计算并分摊金额
                const finalCollectedRows = productsInfo.map(p => {
                    // 计算权重比例
                    const ratio = jdPriceTotalWeight > 0 ? (p.weight / jdPriceTotalWeight) : (1 / productsInfo.length);

                    // 分摊总价和单价
                    const distributedTotal = (totalActualPaid * ratio).toFixed(2);
                    const distributedUnit = (distributedTotal / p.pCount).toFixed(2);

                    // 尺码提取逻辑：取空格后的最后一段，并移除括号
                    // 例如："阿迪达斯...KE4058 3XL" -> "3XL"
                    const nameParts = p.pName.split(/\s+/);
                    const sizeRaw = nameParts[nameParts.length - 1] || "";
                    const size = sizeRaw.replace(/[()（）]/g, "");
                    // 仓库逻辑
                    const wh = (typeof warehouse === 'function') ? warehouse(addressInfo) : "默认仓库";
                    // 物流信息（假设你有 extractLogistics 函数）
                    const logi = (typeof extractLogistics === 'function') ? extractLogistics() : {sn: "", company: ""};

                    return [
                        orderTime,              // 订单时间
                        "京东1",                // 来源账号
                        shopName,               // 商铺名称
                        `="${orderId}"`,        // 订单号
                        p.pName,                // 商品名称
                        p.pSku,                  // 发货型号
                        `="${size}"`,           // 码数
                        distributedUnit,        // 成本 (分摊单价)
                        p.pCount,               // 商品数量
                        "",                     // 退货数量
                        distributedTotal,       // 总计 (分摊总价)
                        `="${logi.sn}"`,        // 物流号
                        orderStatus,            // 订单状态
                        wh,                     // 仓库
                        "",                     // 状态
                        logi.company,           // 物流公司
                        size,                   // 衣服型号
                        "",                     // 退货数量
                        distributedUnit,        // 分摊单价(重复项)
                        "",                     // 备注
                        orderLink,              // 订单链接
                        p.pLink,                // 商品链接
                        addressInfo             // 地址
                    ];
                });

                // 5. 保存与反馈
                if (finalCollectedRows.length > 0) {
                    if (typeof saveToStore === 'function') saveToStore(finalCollectedRows);
                    // 写入剪贴板 (Tab分隔格式，方便直接粘贴到Excel)
                    const clipboardContent = finalCollectedRows.map(r => r.join("\t")).join("\n");
                    GM_setClipboard(clipboardContent);
                    console.log('采集成功，共计 ' + finalCollectedRows.length + ' 件商品');
                    // 如果是脚本自动打开的，则延迟关闭
                    // if (window.location.href.includes('PassKey')) {
                    //   setTimeout(() => window.close(), 1200);
                    // }
                }
            }, 2000); // 等待页面加载稳定
        });
    }

    // --- 逻辑：订单列表页 ---
    if (location.host === 'order.jd.com') {
        const scanListOrders = () => {
            const tbodies = document.querySelectorAll("tbody[id^='tb-']");
            let listData = [];

            tbodies.forEach(tbody => {
                const orderId = tbody.id.replace('tb-', '');
                const orderTime = tbody.querySelector(".dealtime")?.innerText.trim() || "";

                // 核心修复：获取第一个 a 标签作为店铺名
                const shopContainer = tbody.querySelector(".order-shop");
                let shopName = "京东自营";
                if (shopContainer) {
                    const firstLink = shopContainer.querySelector("a");
                    if (firstLink) {
                        shopName = firstLink.getAttribute("title") || firstLink.innerText.trim();
                    }
                } else {
                    const backupLink = tbody.querySelector(".shop-txt") || tbody.querySelector(".shop-name a");
                    if (backupLink) shopName = backupLink.getAttribute("title") || backupLink.innerText.trim();
                }

                const totalAmount = parseFloat(tbody.querySelector(".amount span")?.innerText.replace(/[^\d.]/g, '') || "0");
                const orderStatus = tbody.querySelector(".order-status")?.innerText.trim() || "";
                const orderLink = tbody.querySelector(".status a[href*='details.jd.com']")?.href || "";
                const addrBox = tbody.querySelector(".consignee .prompt-01 .pc");
                const addrPreview = addrBox ? addrBox.innerText.replace(/\n/g, ' ') : "";

                let warehouseName = "自家仓库";
                try {
                    if (typeof warehouse === 'function') warehouseName = warehouse(addrPreview);
                } catch (e) {
                }

                const productRows = tbody.querySelectorAll(".tr-bd");
                let totalQty = 0;
                let pTemp = [];

                productRows.forEach(row => {
                    const pNameElem = row.querySelector(".p-name a");
                    if (!pNameElem) return;
                    const pCount = parseInt(row.querySelector(".goods-number")?.innerText.replace('x', '') || "1");
                    pTemp.push({name: pNameElem.innerText.trim(), link: pNameElem.href, count: pCount});
                    totalQty += pCount;
                });

                pTemp.forEach(p => {
                    const allocatedTotal = totalQty > 0 ? (totalAmount * (p.count / totalQty)) : 0;
                    const avgCost = (allocatedTotal / p.count).toFixed(2);
                    const sizeMatch = p.name.match(/\s([A-Z0-9\/]+)$/i);
                    const size = sizeMatch ? sizeMatch[1] : "";

                    listData.push([
                        orderTime, "京东1", cleanStr(shopName), `="${orderId}"`, cleanStr(p.name),
                        "", `="${size}"`, avgCost, p.count, "",
                        allocatedTotal.toFixed(2), "", cleanStr(orderStatus), warehouseName, "",
                        "", size, "", avgCost, "",
                        orderLink, p.link, cleanStr(addrPreview)
                    ]);
                });
            });
            if (listData.length > 0) saveToStore(listData);
        };

        const injectUI = () => {
            if (document.getElementById('jd-tool-container')) return;
            const container = document.createElement('div');
            container.id = 'jd-tool-container';
            container.style = 'position: fixed; top: 120px; left: 10px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; background: #fff; padding: 12px; border: 2px solid #e1251b; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);';

            const createBtn = (text, color, onClick) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.style = `padding: 8px 12px; border-radius: 4px; border: none; cursor: pointer; color: white; font-size: 13px; font-weight: bold; background: ${color};`;
                btn.onclick = onClick;
                return btn;
            };

            // container.appendChild(createBtn('🚀 批量采集详情 (含多包裹物流)', '#e1251b', () => {
            //   const links = Array.from(document.querySelectorAll('a[href*="details.jd.com/normal/item.action"]'));
            //   //去除orderId重复的
            //
            //   const uniqueLinks = [...new Map(links.map(link => [link.href.split('orderId=')[1].split('&')[0], link])).values()];
            //   uniqueLinks.forEach((link, i) => setTimeout(() => window.open(link.href, '_blank'), i * 1500));
            // }));
            // //Uncaught TypeError: Cannot read properties of undefined (reading 'split')

            container.appendChild(createBtn('🚀 批量采集详情 (含多包裹物流)', '#e1251b', () => {
                // 1. 获取所有详情链接
                const links = Array.from(document.querySelectorAll('a[href*="details.jd.com/normal/item.action"]'));

                // 2. 过滤并排重
                const uniqueLinks = [...new Map(
                    links
                        .filter(link => link.href && link.href.includes('orderid=')) // 安全过滤：确保链接包含 orderId
                        .map(link => {
                            try {
                                // 提取 orderId
                                const orderId = link.href.split('orderid=')[1].split('&')[0];
                                return [orderId, link];
                            } catch (e) {
                                // 万一 split 失败的兜底处理
                                return [Math.random(), link];
                            }
                        })
                ).values()];

                // 3. 批量打开
                if (uniqueLinks.length === 0) {
                    console.warn('未找到有效的订单详情链接');
                    return;
                }

                uniqueLinks.forEach((link, i) => {
                    setTimeout(() => {
                        console.log(`正在打开订单详情: ${link.href}`);
                        window.open(link.href, '_blank');
                    }, i * 1500);
                });
            }));


            container.appendChild(createBtn('📥 导出 Excel (CSV)', '#28a745', () => {
                const data = getStoredData();
                const csvContent = [CSV_HEADERS, ...data].map(r => r.join(",")).join("\n");
                const blob = new Blob(['\uFEFF' + csvContent], {type: 'text/csv;charset=utf-8;'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `京东订单全量导出_${new Date().toLocaleDateString()}.csv`;
                a.click();
            }));

            container.appendChild(createBtn('🗑️ 清除所有数据', '#6c757d', () => {
                if (confirm('警告：这将永久删除本地保存的所有采集记录，确定吗？')) {
                    GM_deleteValue(STORAGE_KEY)
                    location.reload();
                }
            }));

            const countDiv = document.createElement('div');
            countDiv.style = 'font-size: 12px; color: #e1251b; font-weight: bold; text-align: center;';
            setInterval(() => {
                countDiv.innerText = `累计已采: ${getStoredData().length} 条`;
            }, 1000);
            container.appendChild(countDiv);
            document.body.appendChild(container);
        };

        scanListOrders();
        injectUI();
        setInterval(scanListOrders, 5000);
    }
})();