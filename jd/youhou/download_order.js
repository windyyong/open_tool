// ==UserScript==
// @name         京东订单全自动化采集工具 (物流增强版)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  列表页自动保存，详情页比例拆分实付款，深度兼容多种物流显示格式，自动复制并导出
// @author       Gemini
// @match        *://order.jd.com/center/list.action*
// @match        *://details.jd.com/normal/item.action*
// @match        *://order.jd.com/center/item.action*
// @match        *://club.jd.com/myJdcomments/*
// @require      https://cdn.jsdelivr.net/gh/windyyong/open_tool@main/youhou/common/tampermonkey_common.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.15/lodash.min.js
// @require      https://cdn.bootcdn.net/ajax/libs/jquery/2.2.0/jquery.min.js
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

  function getSortStoredData() {
    let data = getStoredData();
    if (data.length > 0) {
      data.sort((a, b) => {
        const dateA = new Date(a[0]);
        const dateB = new Date(b[0]);
        return dateB - dateA; // 降序排序
      });
      GM_setValue(STORAGE_KEY, data);
    }
    return data;
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
      const ORDER_ID_IDX = 3;    // 订单号索引
      const PRODUCT_URL_IDX = 21; // 商品链接索引
      const existsIdx = current.findIndex(c => {
        // 基础校验：确保行数据存在且长度足够
        if (!c || !newRow || c.length <= PRODUCT_URL_IDX || newRow.length <= PRODUCT_URL_IDX) {return false;}
        // 获取并预处理数据
        // 使用 String() 确保类型安全，trim() 去除首尾空格
        const currentOrderId = String(c[ORDER_ID_IDX] || "").trim();
        const newOrderId = String(newRow[ORDER_ID_IDX] || "").trim();
        const currentUrl = String(c[PRODUCT_URL_IDX] || "").trim();
        const newUrl = String(newRow[PRODUCT_URL_IDX] || "").trim();
        // 执行严格相等比对
        return currentOrderId === newOrderId && currentUrl === newUrl;
      });

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

  /**
   * 从商品名称中提取货号和码数（最终修复版：避免匹配年份/无效数字）
   * @param {string} productName - 商品名称字符串
   * @returns {object} { sku: 货号, size: 码数 } 无匹配时返回空字符串
   */
  function extractSkuAndSize(productName) {
    if (!productName || typeof productName !== 'string') {
      return { sku: '', size: '' };
    }

    // ===== 1. 提取货号 =====
    const skuRegex = /([A-Za-z]{1,5}[\d\-]{2,9})(?:\s+\1)?\s*(\d+(\.\d+)?|[A-Z]+(\d+)?)?$/;
    const skuMatch = productName.match(skuRegex);
    let sku = '';
    if (skuMatch && skuMatch[1]) {
      sku = skuMatch[1].toUpperCase();
    } else {
      const fallbackSkuRegex = /[A-Za-z]{1,5}[\d\-]{2,9}/g;
      const fallbackMatches = productName.match(fallbackSkuRegex);
      sku = fallbackMatches ? fallbackMatches[fallbackMatches.length - 1].toUpperCase() : '';
    }

    // ===== 2. 提取码数（最终修复版）=====
    // 核心优化：
    // 1. 先过滤年份（4位数字）、货号，避免误匹配
    // 2. 优先匹配字母型码数（衣物S/M/L/XL），再匹配数字型码数（鞋码）
    // 3. 只取名称最后3个片段中的码数（码数通常在末尾）

    // 步骤1：清理名称（去掉货号、4位年份、多余空格）
    const cleanName = productName
      .replace(new RegExp(sku, 'g'), '') // 去掉货号
      .replace(/\b\d{4}\b/g, '') // 去掉4位年份（如2026、2025）
      .replace(/\s+/g, ' ') // 合并多余空格
      .trim();

    // 步骤2：分割为片段，只取最后3个片段（码数几乎都在末尾）
    const nameParts = cleanName.split(' ');
    const lastParts = nameParts.slice(-3); // 取最后3个片段
    const targetStr = lastParts.join(' ');

    // 码数正则：
    const sizeRegex = {
      // 字母型码数（优先匹配）：S/M/L/XL/XXS/3XL 等
      letter: /\b([1-9]?[XSML]+)\b/gi,
      // 数字型码数：45、38.5、42.5 (270mm)（排除单独的4位数字）
      number: /\b(?!\d{4}\b)(\d+(\.\d+)?)\s*(?:\(?\d*mm\)?)?\b/g
    };

    let size = '';

    // 第一步：优先匹配字母型码数（解决S/M/L被年份覆盖的问题）
    const letterMatches = targetStr.match(sizeRegex.letter);
    if (letterMatches && letterMatches.length > 0) {
      size = letterMatches[letterMatches.length - 1].toUpperCase().trim();
    }
    // 第二步：字母型匹配不到，再匹配数字型码数
    else {
      const numberMatches = targetStr.match(sizeRegex.number);
      if (numberMatches && numberMatches.length > 0) {
        size = numberMatches[numberMatches.length - 1]
          .replace(/\s|\(|\)|mm/g, '')
          .trim();
      }
    }

    // 最终格式校验：确保码数是合法格式
    const validSizeRegex = /^(?:\d+(\.\d+)?|[1-9]?[XSML]+)$/i;
    if (size && !validSizeRegex.test(size)) {
      size = '';
    }

    // 服务类商品特殊处理
    if (productName.includes('京东养车') || productName.includes('服务')) {
      sku = '';
      size = '';
    }

    return { sku, size };
  }

  function cleanStr(val) {
    if (!val) return "";
    return val.toString().replace(/,/g, "，").replace(/\n/g, " ").trim();
  }

  // --- 逻辑：订单详情页 ---
  if (location.host.includes('details.jd.com')) {
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
        sn : Array.from(logisticsSet).join("|"),
        company : Array.from(courierSet).join("|")
      };
    }

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
        var addressInfo = document.querySelector(".ui-switchable-panel .dl:first-child .dd .item:nth-child(2) .info-rcol")?.innerText.trim() || "";
        if (isEmpty(addressInfo)) {
          addressInfo = document.querySelector(".ui-switchable-panel-main .ui-switchable-panel .dl:nth-child(1) .item:nth-child(2) .info-rcol:nth-child(1)")?.innerText.trim() || "";
        }

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
          const pLink = cleanUrl(pNameElement.href);
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
          const wh = (typeof warehouse === 'function') ? warehouse(addressInfo) : "自家仓库";
          // 物流信息（假设你有 extractLogistics 函数）
          const logi = (typeof extractLogistics === 'function') ? extractLogistics() : {sn : "", company : ""};

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
        var shopName = "京东自营";
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
        const addrBox = tbody.querySelector(".consignee .prompt-01 .pc .detailedAddress");
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
          pTemp.push({name : pNameElem.innerText.trim(), link : cleanUrl(pNameElem.href), count : pCount});
          totalQty += pCount;
        });

        pTemp.forEach(p => {
          const allocatedTotal = totalQty > 0 ? (totalAmount * (p.count / totalQty)) : 0;
          const avgCost = (allocatedTotal / p.count).toFixed(2);
          const skuAndSize=extractSkuAndSize(cleanStr(p.name));
          const sku=skuAndSize.sku;
          const size = skuAndSize.size;

          listData.push([
            orderTime, "京东1", cleanStr(shopName), `="${orderId}"`, cleanStr(p.name),
            `="${sku}"`, `="${size}"`, avgCost, p.count, "",
            allocatedTotal.toFixed(2), "", cleanStr(orderStatus), warehouseName, "",
            "", size, "", avgCost, "",
            orderLink, p.link, cleanStr(addrPreview)
          ]);
        });
      });
      if (listData.length > 0) {
        // 只保存前15条到本地
        const limitedListData = listData.slice(0, 15);
        saveToStore(limitedListData);
        // 复制前15条到剪贴板
        const clipboardContent = limitedListData.map(row => row.join("\t")).join("\n");
        GM_setClipboard(clipboardContent);
        console.log(`列表页采集成功，仅保存并复制前 ${limitedListData.length} 件商品，已完成`);
      };
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
      //   const uniqueLinks = [...new Map(links.map(link => [link.href.split('orderId=')[1].split('&')[0],
      // link])).values()]; uniqueLinks.forEach((link, i) => setTimeout(() => window.open(link.href, '_blank'), i *
      // 1500)); })); //Uncaught TypeError: Cannot read properties of undefined (reading 'split')

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
        const data = getSortStoredData();
        const csvContent = [CSV_HEADERS, ...data].map(r => r.join(",")).join("\n");
        const blob = new Blob(['\uFEFF' + csvContent], {type : 'text/csv;charset=utf-8;'});
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
    setTimeout(scanListOrders, 5000);
  }

  // --- 逻辑：订单评价 --- https://club.jd.com/myJdcomments/myJdcomment.action?sort=3的url链接中没有参数sort=3为评价，有sort=3为追评
  if (location.host === 'club.jd.com') {
    // --- 配置数据 ---
    const comments = [
      '这款商品价格比平时优惠很多，性价比超高，看到活动果断囤了好几件！实物和描述一致，颜值超高特别好看。客服态度热情有礼貌，回复及时又耐心，是真正的良心商家，整体购物体验超棒，强烈推荐，以后还会继续支持回购！',
      '商品整体非常不错，设计实用，日常使用起来特别方便，性价比真的很高！最满意的还是京东物流，一如既往地快速高效，下单没多久就收到货了，包装完好无损。配送小哥服务也很好，希望平台继续保持，越做越好，太让人放心了！',
      '一直在京东购物，真的特别省心省力！多快好省的体验名不虚传，下单后发货快、配送快，不用漫长等待。商品质量有保障，品质靠谱，售后也让人安心，不管是日常用品还是服饰鞋包都很满意，京东确实给力，值得信赖！',
      '这件商品质量真的绝了，做工精细很有质感，款式时尚大气，和图片完全没有色差。上身后特别好看，版型正，穿着柔软舒服，不磨脚不压脚，走路轻松又轻快，长时间出门也不会累，不管是颜值还是舒适度都超出预期！',
      '尺码标准特别合适，不用纠结大小，上脚立刻就能感受到舒服。款式百搭不挑人，日常穿搭都很合适，而且非常耐穿。透气性很好，不闷脚不出汗，材质柔软亲肤，做工细节都很到位，穿起来轻松自在，整体非常满意，推荐大家入手！'
    ];

    const IMG_CLOTHING = "//img30.360buyimg.com/shaidan/jfs/t1/203880/18/46617/83803/6732ff59F09528191/5cc5e71f589f1d78.jpg,//img30.360buyimg.com/shaidan/jfs/t1/189478/14/52987/170468/6732ff79F63ab729f/10f075e737594a04.jpg";
    const IMG_GENERAL = "//img30.360buyimg.com/shaidan/jfs/t1/227423/3/16375/171204/661e979fF9628e58a/bf86877b06319d82.jpg,//img30.360buyimg.com/shaidan/jfs/t1/240310/17/7667/94737/661e97a3F56174b76/9698933ba0984152.jpg";

    // --- 工具函数 ---
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const getProductType = (name) => {
      const keywords = ['衣', '衫', '裤', '袜', '鞋', '裙', '服', '织'];
      return keywords.some(k => name.includes(k)) ? 'clothing' : 'other';
    };

    const getRandomComment = () => encodeURIComponent(comments[Math.floor(Math.random() * comments.length)]);

    // --- 核心逻辑：初评 ---
    async function doStandardEvaluate() {
      const orderMain = document.getElementById("main");
      const orderItems = orderMain.querySelectorAll(".mycomment-table tbody");
      console.log(`【京东助手】开始初评处理，共 ${orderItems.length} 个订单项`);

      for (let i = 0; i < orderItems.length; i++) {
        const item = orderItems[i];
        const orderIdNode = item.querySelector("span.number a");
        if (!orderIdNode) continue;

        const orderId = orderIdNode.innerText.trim();
        console.log(`[初评] 正在处理订单: ${orderId}`);

        // 1. 发送 Survey (前置请求)
        await new Promise(r => {
          const surveyBody = `oid=${orderId}&gid=69&sid=549656&tags=&ro1827=1827A1&ro1828=1828A1&ro1829=1829A1`;
          $.post(`https://club.jd.com/myJdcomments/insertRestSurvey.action?voteid=145&ruleid=${orderId}`, surveyBody, r, "json");
        });

        // 2. 遍历商品
        const productNodes = item.querySelectorAll("div.p-name a");
        for (let j = 0; j < productNodes.length; j++) {
          const pNode = productNodes[j];
          const pName = pNode.innerText.trim();
          const pId = pNode.href.match(/(\d+)\.html/)?.[1];

          let bodyStr = `orderId=${orderId}&productId=${pId}&score=5&saveStatus=2&anonymousFlag=1`;
          bodyStr += `&content=${getRandomComment()}`;
          bodyStr += `&imgs=${getProductType(pName) === 'clothing' ? IMG_CLOTHING : IMG_GENERAL}`;

          // await new Promise(r => {
          //   $.post("https://club.jd.com/myJdcomments/saveProductComment.action", bodyStr, (res) => {
          //     console.log(`[初评结果] 商品 ${pId}:`, res);
          //     r();
          //   }, "json");
          // });

          // --- 核心：通过显式声明 scriptCharset 和 contentType 解决乱码 ---
          const commentText = getRandomComment();
          const imgs = getProductType(pName) === 'clothing' ? IMG_CLOTHING : IMG_GENERAL;
          await new Promise(r => {
            $.ajax({
              url: "https://club.jd.com/myJdcomments/saveProductComment.action",
              type: "POST",
              data: {
                orderId: orderId,
                productId: pId,
                score: "5",
                saveStatus: "2",
                anonymousFlag: "1",
                content: commentText,
                imgs: imgs
              },
              contentType: "application/x-www-form-urlencoded; charset=GBK", // 强制声明编码
              success: (res) => {
                console.log(`[评价结果] 商品 ${pId}:`, res);
                r();
              },
              error: (err) => {
                console.error(`[评价失败] 商品 ${pId}`, err);
                r();
              }
            });
          });
          await sleep(1000);
        }
      }
      alert("初评任务执行完毕");
    }

    // --- 核心逻辑：追评 ---
    async function doAgainEvaluate() {
      const orderMain = document.getElementById("main");
      const operateLinks = orderMain.querySelectorAll("div.mycomment-bd div.operate a");
      const productNames = orderMain.querySelectorAll("div.mycomment-bd div.p-name a");

      console.log(`【京东助手】开始追评处理，共 ${operateLinks.length} 个项`);

      for (let i = 0; i < operateLinks.length; i++) {
        const url = operateLinks[i].href;
        const orderId = url.match(/orderId=(\d+)/)?.[1];
        const productId = url.match(/sku=(\d+)/)?.[1];
        if (!orderId || !productId) continue;

        const productName = productNames[i]?.innerText.trim() || "";
        const refererUrl = `https://club.jd.com/afterComments/productPublish.action?sku=${productId}&orderId=${orderId}`;

        console.log(`[追评] 正在处理: 订单 ${orderId} / 商品 ${productId}`);

        let bodyStr = `orderId=${orderId}&productId=${productId}&score=5&anonymousFlag=1`;
        bodyStr += `&content=${getRandomComment()}`;
        bodyStr += `&imgs=${getProductType(productName) === 'clothing' ? IMG_CLOTHING : IMG_GENERAL}`;

        // 使用 fetch 模拟 XHR 行为
        await fetch('https://club.jd.com/afterComments/saveAfterCommentAndShowOrder.action', {
          method : 'POST',
          headers : {
            'Content-Type' : 'application/x-www-form-urlencoded',
            'X-Requested-With' : 'XMLHttpRequest',
            'Referer' : refererUrl
          },
          body : bodyStr
        }).then(res => res.json()).then(data => {
          console.log(`[追评结果] 订单 ${orderId}:`, data);
        }).catch(e => console.error(e));

        await sleep(1000);
      }
      alert("追评任务执行完毕");
    }

    // --- [新增] 核心逻辑：服务评价 ---
    async function doServiceEvaluate() {
      const orderMain = document.getElementById("main");
      // 寻找服务评价页面的订单行
      const orderItems = orderMain.querySelectorAll(".mycomment-table tbody");
      console.log(`【京东助手】开始服务评价处理，共 ${orderItems.length} 个订单项`);

      for (let i = 0; i < orderItems.length; i++) {
        const item = orderItems[i];
        // 提取订单号
        const orderIdNode = item.querySelector("span.number a");
        if (!orderIdNode) continue;
        const orderId = orderIdNode.innerText.trim();

        // 提取 venderId (通常隐藏在“查看详情”链接或页面脚本中，如果找不到，尝试从页面元素获取)
        // 这里的逻辑需要根据京东服务评价页面的具体 DOM 结构调整
        // 常见方式是查找该行内的评价按钮链接中的参数
        const evalBtn = item.querySelector("a[href*='venderId']");
        let venderId = "";
        if (evalBtn) {
          venderId = evalBtn.href.match(/venderId=(\d+)/)?.[1] || "";
        }

        console.log(`[服务评价] 正在处理订单: ${orderId}, 店铺ID: ${venderId}`);

        // 服务评价通常是一次性提交三个维度的评分
        // 维度：1.卖家服务(ro1001) 2.仓储配送(ro1002) 3.物流速度(ro1003)
        const serviceData = {
          orderId: orderId,
          venderId: venderId,
          ro1001: "5", // 卖家服务 5分
          ro1002: "5", // 仓储配送 5分
          ro1003: "5", // 物流速度 5分
          saveStatus: "1"
        };

        await new Promise(r => {
          $.ajax({
            url: "https://club.jd.com/myJdcomments/saveVenderRemark.action",
            type: "POST",
            data: serviceData,
            contentType: "application/x-www-form-urlencoded; charset=GBK",
            success: (res) => {
              console.log(`[服务评价结果] 订单 ${orderId}:`, res);
              r();
            },
            error: (err) => {
              console.error(`[服务评价失败] 订单 ${orderId}`, err);
              r();
            }
          });
        });

        await sleep(1200);
      }
      alert("服务评价任务执行完毕");
    }

    // --- UI 注入 (更新版，支持三个模式切换) ---
    const injectUI = () => {
      if (document.getElementById('jd-eval-container')) return;

      // 根据 URL 参数判断当前模式
      const search = window.location.search;
      let mode = "standard"; // 默认初评
      if (search.includes('sort=3')) mode = "again"; // 追评
      if (search.includes('sort=4') || document.querySelector(".curr[href*='sort=4']")) mode = "service"; // 服务评价

      const container = document.createElement('div');
      container.id = 'jd-eval-container';
      container.style = 'position: fixed; top: 120px; left: 10px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; background: #fff; padding: 12px; border: 2px solid #e1251b; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 160px;';

      const title = document.createElement('div');
      const modeName = { "standard": "初评助手", "again": "追评助手", "service": "服务评价助手" };
      title.innerText = `🚀 ${modeName[mode]}模式`;
      title.style = 'font-size: 13px; font-weight: bold; color: #e1251b; text-align: center; margin-bottom: 5px;';
      container.appendChild(title);

      const btn = document.createElement('button');
      btn.innerText = `开始自动${modeName[mode].replace('助手', '')}`;
      btn.style = `padding: 10px; border-radius: 4px; border: none; cursor: pointer; color: white; font-size: 13px; font-weight: bold; background: #e1251b;`;

      btn.onclick = async () => {
        btn.disabled = true;
        btn.innerText = '执行中...';
        if (mode === "service") await doServiceEvaluate();
        else if (mode === "again") await doAgainEvaluate();
        else await doStandardEvaluate();

        btn.disabled = false;
        btn.innerText = `开始自动${modeName[mode].replace('助手', '')}`;
      };

      container.appendChild(btn);

      // 模式切换链接
      const links = document.createElement('div');
      links.style = 'text-align: center; margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 11px;';
      links.innerHTML = `
      <a href="?sort=0" style="color:blue;">切换到初评列表</a>
      <a href="?sort=3" style="color:blue;">切换到追评列表</a>
      <a href="?sort=4" style="color:blue;">切换到服务评价</a>
    `;
      container.appendChild(links);

      document.body.appendChild(container);
    };

    // --- 启动 ---
    const init = () => {
      // 等待京东页面加载 jQuery 和主内容
      if (document.getElementById("main")) {
        injectUI();
      } else {
        setTimeout(init, 1000);
      }
    };

    init();

  }

})();