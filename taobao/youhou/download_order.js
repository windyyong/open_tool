// ==UserScript==
// @name         淘宝脚本
// @version      1.0.2
// @author       windy
// @match        *://buyertrade.taobao.com/trade/*
// @match        *://trade.taobao.com/trade/detail/*
// @match        *://trade.tmall.com/detail/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.15/lodash.min.js
// @require      https://cdn.jsdelivr.net/gh/windyyong/open_tool@main/youhou/common/tampermonkey_common.js
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @license      MIT
// ==/UserScript==

//1.订单数据通过orders作为key字段，存储在GM_setValue中，其中orders是数组，数组中的元素是一个订单信息，元素的items则是子订单信息
//2.注意所有订单号要用字符串保存，否则会因为bigint问题异常

var ProductNameBlackList = [];
var defaultProductNameBlackList = ["保险服务", "增值服务", "买家秀", "购物金充值", "购物金"];
const orderListApiUrl = "https://buyertrade.taobao.com/trade/itemlist/asyncBought.htm?action=itemlist/BoughtQueryAction&event_submit_do_query=1&_input_charset=utf8";

//页面url正则
const orderListUrlRegExp = /(http|https):\/\/buyertrade\.taobao.*?\/trade/g;
const taobaoDetailUrlRegExp = /(http|https):\/\/(buyer){0,1}trade\.taobao.*?\/trade\/detail/g;
const tmallDetailUrlRegExp = /(http|https):\/\/trade\.tmall.*?\/detail/g;
var openDetailPageSize = 0;//用于记录打开的页面数量，防止打开过多
var nickName = undefined;

// 页面加载
window.addEventListener('load', function () {
  // 加载完成后执行的代码
  if (orderListUrlRegExp.exec(document.URL)) {
    urlAddRouteTo(document.URL)
    addOrderListMenuComponent();
    orderListPage();
    handleXMLResult();
    getNickName();
  } else if (taobaoDetailUrlRegExp.exec(document.URL)) {
    urlAddRouteTo(document.URL)
    getNickName();
    parseTaobaoOrderDetailRawJson(document.body.innerHTML);
  } else if (tmallDetailUrlRegExp.exec(document.URL)) {
    urlAddRouteTo(document.URL)
    getNickName();
    parseTmallOrderDetailRawJson(document.body.innerHTML);
  }
}, false);

/**
 * 规范化 URL 中的 route_to 参数
 * 逻辑：如果存在 route_to=tm2 则替换为 tm1；如果不存在 route_to 则添加 tm1；
 * 如果已经是 tm1 则不操作，避免无限刷新。
 * @param {string} _url 待处理的 URL 字符串
 */
function urlAddRouteTo(_url) {
  try {
    // 使用 URL 构造函数处理，自动处理 ? 和 & 的逻辑
    const urlObj = new URL(_url, window.location.origin);
    const params = urlObj.searchParams;
    const currentRoute = params.get('route_to');

    // 如果已经是 tm1，直接返回，不执行跳转逻辑
    if (currentRoute === 'tm1') {
      return;
    }

    // 无论原来是 tm2 还是不存在，统一设置为 tm1
    params.set('route_to', 'tm1');

    // 构建最终 URL（保留 hash 等信息）
    const finalUrl = urlObj.toString();
    // 打印最终 URL（调试用）
    console.log("1规范化后的 URL:", finalUrl);

    // 执行跳转
    window.location.href = finalUrl;
  } catch (e) {
    console.error("URL 解析失败:", e);

    // 兜底方案：如果 URL 构造函数失败（如非法字符串），执行简单的字符串逻辑
    let fallbackUrl = _url;

    if (fallbackUrl.includes('route_to=tm2')) {
      fallbackUrl = fallbackUrl.replace('route_to=tm2', 'route_to=tm1');
    } else if (!fallbackUrl.includes('route_to=tm1')) {
      fallbackUrl += (fallbackUrl.indexOf('?') === -1 ? '?' : '&') + 'route_to=tm1';
    }
    // 打印最终 URL（调试用）
    console.log("2规范化后的 URL:", fallbackUrl);
    window.location.href = fallbackUrl;
  }
}

//处理http请求结果
function handleXMLResult() {
  addXMLRequestCallback(function (xhr) {
    xhr.addEventListener("load", function () {
      if (xhr.readyState == 4 && xhr.status == 200) {
        //订单api的接口url
        if (xhr.responseURL == orderListApiUrl) {
          console.log("返回的订单数据" + xhr.responseText)
          var ordersRaw = parseJSON(xhr.responseText);
          extractOrderListData(ordersRaw);
        }
      }
    });
  });
}

//监听http请求
function addXMLRequestCallback(callback) {
  var oldSend, i;
  if (XMLHttpRequest.callbacks) {
    XMLHttpRequest.callbacks.push(callback);
  } else {
    XMLHttpRequest.callbacks = [callback];
    oldSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      for (i = 0; i < XMLHttpRequest.callbacks.length; i++) {
        XMLHttpRequest.callbacks[i](this);
      }
      return oldSend.apply(this, arguments);
    };
  }
}

//添加按钮
function addOrderListMenuComponent() {
  const orderListMain = document.getElementById("J_bought_main");

  const userMain = document.createElement("div");
  const userMainText = document.createElement("span");
  const userMainList = document.createElement("ul");
  const userMainListRow1List = document.createElement("ul");

  const userMainListRow1 = document.createElement("li");
  const userMainListRow2 = document.createElement("li");
  const userMainListRow3 = document.createElement("li");

  const userMainListRow11 = document.createElement("li");
  const userMainListRow12 = document.createElement("li");
  const userMainListRow13 = document.createElement("li");

  userMain.id = "userMain";
  userMainText.id = "userMainText";
  userMainList.id = "userMainList";
  userMainListRow1List.id = "userMainListRow1List";

  userMainListRow1.id = "userMainListRow1";
  userMainListRow2.id = "userMainListRow2";
  userMainListRow3.id = "userMainListRow3";
  userMainListRow11.id = "userMainListRow11";
  userMainListRow12.id = "userMainListRow12";
  userMainListRow13.id = "userMainListRow13";

  orderListMain.insertBefore(userMain, orderListMain.childNodes[0]);
  userMain.appendChild(userMainText);
  userMain.appendChild(userMainList);
  userMainList.appendChild(userMainListRow1);
  userMainList.appendChild(userMainListRow2);
  userMainList.appendChild(userMainListRow3);
  userMainListRow1.appendChild(userMainListRow1List);
  userMainListRow1List.appendChild(userMainListRow11);
  userMainListRow1List.appendChild(userMainListRow12);
  userMainListRow1List.appendChild(userMainListRow13);

  createToast();
  createBlackListTextarea(userMainText);

  addCheckbox(userMainListRow11, changeBlackListStatus, "商品名黑名单过滤", "BlackListStatus");
  // addCheckbox(userMainListRow12, changeDelayStatus, "快照获取随机延时", "DelayStatus");
  // addCheckbox(userMainListRow13, changeSnapProductNameStatus, "快照商品名称获取", "SnapProductNameStatus");

  addButton(userMainListRow2, cleanBlackList, "清空黑名单列表", "cleanBlackList");
  addButton(userMainListRow2, resetBlackList, "重置黑名单列表", "resetBlackList");
  addButton(userMainListRow2, setBlackList, "设置黑名单列表", "setBlackList");

  addButton(userMainListRow3, cleanLocalData, "清空订单数据", "cleanOrdersList");
  addButton(userMainListRow3, exportOrdersList, "导出订单数据", "exportOrdersList");
  // addButton(userMainListRow3, orderListPage, "添加本页订单", "addOrdersList");
  addButton(userMainListRow3, openOrderDetailPage, "打开订单详情", "addOrdersList");

  // document.getElementById("exportOrdersList").disabled = true;
  // document.getElementById("exportOrdersList").style.opacity = 0.6;

  // document.getElementById("cleanOrdersList").disabled = true;
  // document.getElementById("cleanOrdersList").style.opacity = 0.6;

  setElementStyle();
  resetBlackList();

  console.info("在订单数据页面添加按钮!");
}

//通知气泡默认属性
function createToast() {
  let Toast = document.createElement("div");
  let ToastText = document.createTextNode("通知气泡");

  Toast.id = "Toast";
  Toast.style.visibility = "hidden";
  Toast.style.position = "fixed";
  Toast.style.bottom = "0px";
  Toast.style.fontSize = "17px";
  Toast.style.minWidth = "200px";
  Toast.style.backgroundColor = "#4CAF50";
  Toast.style.color = "white";
  Toast.style.textAlign = "center";
  Toast.style.borderRadius = "10px";
  Toast.style.padding = "10px";
  Toast.style.zIndex = 1;
  Toast.style.right = "1%";

  Toast.appendChild(ToastText);
  document.getElementById("page").appendChild(Toast);
}

//调用通知气泡
function Toast(toastTextContent, alwaysShow = false) {
  let Toast = document.getElementById("Toast");

  Toast.style.visibility = "visible";
  Toast.textContent = toastTextContent;

  if (alwaysShow === false) {
    setTimeout(function () {
      Toast.style.visibility = "hidden";
    }, 3000);
  }
}

//商品名称黑名单默认属性
function createBlackListTextarea(element) {
  let Textarea = document.createElement("TEXTAREA");
  let TextareaTitle = document.createElement("p");

  Textarea.id = "blackList";
  Textarea.rows = 8;
  Textarea.cols = 30;
  Textarea.placeholder = "商品名称黑名单关键词，每行一条。";
  Textarea.style.padding = "5px";

  TextareaTitle.textContent = "商品名称黑名单关键词";
  TextareaTitle.style.fontSize = "15px";
  TextareaTitle.style.fontWeight = 700;

  element.insertBefore(Textarea, element.childNodes[0]);
  element.insertBefore(TextareaTitle, element.childNodes[0]);
}

//复选框默认属性
function addCheckbox(element, onchangeFunc, text, id) {
  const checkbox = document.createElement("input");
  const checkboxLabel = document.createElement("label");

  checkbox.id = id;
  checkbox.type = "checkbox";
  checkbox.defaultChecked = true;
  checkbox.style.marginRight = "2px";
  checkboxLabel.for = id;
  checkboxLabel.textContent = text;
  checkbox.onchange = function () {
    onchangeFunc();
  };
  element.appendChild(checkbox);
  element.appendChild(checkboxLabel);
}

//按钮默认属性
function addButton(element, onclickFunc, text = "按钮", id, width = "160px", height = "60px") {
  const button = document.createElement("input");
  button.id = id;
  button.type = "button";
  button.value = text;
  button.style.height = height;
  button.style.width = width;
  button.style.align = "center";
  button.style.marginLeft = "40px";
  button.style.color = "white";
  button.style.background = "#409EFF";
  button.style.border = "1px solid #409EFF";
  button.style.fontSize = "16px";
  button.onclick = function () {
    onclickFunc();
  };
  element.appendChild(button);
}

function setElementStyle() {
  const userMain = document.getElementById("userMain");
  const userMainText = document.getElementById("userMainText");
  const userMainList = document.getElementById("userMainList");
  const userMainListRow1List = document.getElementById("userMainListRow1List");

  const userMainListRow1 = document.getElementById("userMainListRow1");
  const userMainListRow2 = document.getElementById("userMainListRow2");
  const userMainListRow3 = document.getElementById("userMainListRow3");
  const userMainListRow11 = document.getElementById("userMainListRow11");
  const userMainListRow12 = document.getElementById("userMainListRow12");
  const userMainListRow13 = document.getElementById("userMainListRow13");

  userMain.style.height = "180px";

  userMainText.style.float = "left";
  userMainText.style.width = "240px";
  userMainText.style.paddingLeft = "30px";
  userMainText.style.display = "inline-block";

  userMainList.style.float = "left";
  userMainList.style.width = "600px";
  //userMainList.style.marginTop = "20px";
  userMainList.style.marginLeft = "-20px";

  userMainListRow1.style.fontSize = "14px";
  userMainListRow1.style.marginBottom = "35px";

  userMainListRow2.style.marginBottom = "20px";

  userMainListRow3.style.marginBottom = "20px";

  userMainListRow11.style.float = "left";
  userMainListRow11.style.width = "160px";
  userMainListRow11.style.marginLeft = "40px";

  userMainListRow12.style.float = "left";
  userMainListRow12.style.width = "160px";
  userMainListRow12.style.marginLeft = "40px";

  userMainListRow13.style.float = "left";
  userMainListRow13.style.width = "160px";
  userMainListRow13.style.marginLeft = "40px";
}

//清空黑名单列表
function cleanBlackList() {
  ProductNameBlackList = [];
  document.getElementById("blackList").value = "";
  Toast("清空黑名单列表!");
  console.info("清空黑名单列表!");
  cleanLocalData();
}

//重置黑名单列表
function resetBlackList() {
  ProductNameBlackList = [];
  document.getElementById("blackList").value = "";
  for (let index = 0; index < defaultProductNameBlackList.length; index++) {
    ProductNameBlackList[index] = defaultProductNameBlackList[index];
    document.getElementById("blackList").value += defaultProductNameBlackList[index] + "\n";
  }
  Toast("重置黑名单列表!");
  console.info("重置黑名单列表!");
  console.info("ProductNameBlackList:" + ProductNameBlackList);
}

//设置黑名单列表
function setBlackList() {
  var textareaContent = document.getElementById("blackList").value + "\n";
  var blackList = textareaContent.match(/.+\n/g);
  for (let index = 0; index < blackList.length; index++) {
    ProductNameBlackList[index] = blackList[index].replace("\n", "");
  }
  Toast("设置黑名单列表!");
  console.info("设置黑名单列表!");
  console.info("ProductNameBlackList:" + ProductNameBlackList);
}

//启用/禁用 商品名黑名单过滤
function changeBlackListStatus() {
  let BlackListStatus = document.getElementById("BlackListStatus").checked;
  if (BlackListStatus === true) {
    document.getElementById("cleanBlackList").disabled = false;
    document.getElementById("cleanBlackList").style.opacity = 1;
    document.getElementById("resetBlackList").disabled = false;
    document.getElementById("resetBlackList").style.opacity = 1;
    document.getElementById("setBlackList").disabled = false;
    document.getElementById("setBlackList").style.opacity = 1;
    Toast("启用商品名黑名单过滤!");
    console.info("启用商品名黑名单过滤!");
  } else {
    document.getElementById("cleanBlackList").disabled = true;
    document.getElementById("cleanBlackList").style.opacity = 0.6;
    document.getElementById("resetBlackList").disabled = true;
    document.getElementById("resetBlackList").style.opacity = 0.6;
    document.getElementById("setBlackList").disabled = true;
    document.getElementById("setBlackList").style.opacity = 0.6;
    Toast("禁用商品名黑名单过滤!");
    console.info("禁用商品名黑名单过滤!");
  }
}

//获取用户昵称
function getNickName() {
  //订单列表页和详情页
  nickName = document.querySelector('div.site-nav-user a')?.textContent;
  //天猫详情页
  if (isEmpty(nickName)) {
    nickName = document.querySelector('a.j_Username')?.textContent;
  }
}

//打开详情页面
function openPage(url) {
  GM_openInTab(url, {active : false, insert : true, setParent : true}) // 打开新的tab
}

//订单列表页面
function orderListPage() {
  return parseOrderListRawJson(document.body.innerHTML);
}

//订单列表页面
function openOrderDetailPage() {
  const listPanel = window.document.getElementById("mytaobao-panel");
  var orderNoSpans = listPanel.querySelectorAll("td.bought-wrapper-mod__head-info-cell___29cDO>span>span:nth-child(3)");
  var orderNos = [];
  for (const orderNoSpan of orderNoSpans) {
    if (!isEmpty(returnInnerText(orderNoSpan))) {
      orderNos.push(returnInnerText(orderNoSpan));
    }
  }
  for (let i = 0; i < orderNos.length; i++) {
    if (i >= openDetailPageSize && i < openDetailPageSize + 20) {
      openPage("https://trade.taobao.com/trade/detail/trade_order_detail.htm?biz_order_id=" + orderNos[i]);
    }
  }
  //页面归0
  openDetailPageSize += 20;
  if (openDetailPageSize > 50) {
    openDetailPageSize = 0;
  }
}

//获取订单列表json数据
function parseOrderListRawJson(_rawText) {
  var beginIndex = _rawText.indexOf("var data = JSON.parse(")
  var lastIndex = _rawText.indexOf("}]}');")
  var dataText = _rawText.substring(beginIndex + ("var data = JSON.parse(").length + 1, lastIndex + 3);
  dataText = dataText.replace(/\\"/g, '"');
  console.log("【当前订单数据数据】\n" + dataText)
  var ordersRaw = parseJSON(dataText);
  return extractOrderListData(ordersRaw);
}

//抽取订单列表页面的订单数据
function extractOrderListData(_orders) {
  var mainOrders = _orders.mainOrders;//主要订单数据
  var orderMap = {};

  //订单数据
  for (let i = 0; i < mainOrders.length; i++) {
    const orderi = mainOrders[i];
    const order = {
      orderNo : orderi?.id || "", // 订单号
      createDay : orderi?.orderInfo?.createDay || "", // 下单日期
      createTime : orderi?.orderInfo?.createTime || "", // 下单日期
      shopName : orderi?.seller?.shopName || "", // 店铺名称
      orderId : orderi?.id || "", // 订单编号
      status : orderi?.statusInfo?.text || "", // 总订单状态
      actualFeePage : toMoney(orderi?.payInfo?.actualFee || 0), // 页面实付款
      actualFee : toMoney(orderi?.payInfo?.actualFee || 0), // 实付款
      refundStatus : orderi?.statusInfo?.text || "", // 实付款 (与实付款相同？)
      orderDetailLink : orderi?.statusInfo?.operations?.find(op => op?.id === "viewDetail")?.url || "", // 订单详情链接
    };

    // 读取子订单数据
    const subOrders = orderi?.subOrders || [];
    var items = [];
    for (const subOrderi of subOrders) {
      var producti = {
        name : subOrderi?.itemInfo?.title, // 商品名称
        spec : Array.isArray(subOrderi?.itemInfo?.skuText)
          ? (subOrderi?.itemInfo?.skuText?.find(spec => spec?.name?.includes("颜色")) || {}).value || ""
          : "", // 商品规格
        size : Array.isArray(subOrderi?.itemInfo?.skuText)
          ? (subOrderi?.itemInfo?.skuText?.find(spec => spec?.name?.includes("尺码") || spec?.name?.includes("鞋码")) || {}).value || ""
          : "", // 码数或鞋码
        originalPrice : toMoney(subOrderi?.priceInfo?.realTotal), // 单价
        quantity : parseInt(subOrderi?.quantity, 10), // 数量
        returnQuantity : undefined, // 退货数量（假设为 0，因数据中未提供）
        productImage : subOrderi?.itemInfo?.pic, // 商品主图
        productLink : subOrderi?.itemInfo?.itemUrl, // 商品链接
        itemStatus : subOrderi?.operations?.[0]?.text,//子订单状态
        itemOrderNo : subOrderi?.id
      };
      if (producti.itemStatus == '查看退款') {
        producti.returnQuantity = producti.quantity;
        producti.itemStatus = "退款成功";
      }

      items.push(producti);
    }
    order.items = items;
    orderMap[orderi.id] = order;
  }
  var orders = Object.values(orderMap)
  console.log("获取到的订单数据：" + jsonString(orders));
  setOrders(orders);
  return orders;
}

//获取淘宝详情json数据
function parseTaobaoOrderDetailRawJson(_rawText) {
  var beginIndex = _rawText.indexOf("var data = JSON.parse(")
  var lastIndex = _rawText.indexOf("');", beginIndex)
  var dataText = _rawText.substring(beginIndex + ("var data = JSON.parse(").length + 1, lastIndex);
  dataText = dataText.replace(/\\"/g, '"');
  dataText = dataText.replace(/\\\\"/g, '\\"');
  console.log("【订单详情数据】\n" + dataText)
  var orderDetailRaw = parseJSON(dataText);
  return extractTaobaoOrderDetailData(orderDetailRaw);
}

function extractTaobaoOrderDetailData(_rawOrder) {
  //子订单信息
  var orderNo = _rawOrder.mainOrder.id;
  var order = getOrder(orderNo);
  var orderItemMap = {};
  var itemOrders = _rawOrder.mainOrder.subOrders;
  for (let i = 0; i < itemOrders.length; i++) {
    const orderItem = itemOrders[i];
    const orderItemDetail = {
      name : orderItem?.itemInfo?.title, // 商品名称，确保存在值
      spec : (
        (orderItem?.itemInfo?.skuText?.[0]?.content?.find(content => content.value?.name?.includes("颜色"))) ||
        {}
      )?.value?.value || "", // 商品规格，如果没有找到颜色，默认为空
      size : (
        (orderItem?.itemInfo?.skuText?.[0]?.content?.find(content => content.value?.name?.includes("尺码") || content.value?.name?.includes("鞋码"))) ||
        {}
      )?.value?.value || "", // 码数，缺失则为空
      originalPrice : toMoney(orderItem?.priceInfo?.replace('￥', '') || 0), // 单价，去掉人民币符号，如果缺失默认为0
      quantity : parseInt(orderItem?.quantity, 10) || 0, // 数量，确保是数字，缺失默认为0
      returnQuantity : undefined, // 退货数量，假设没有数据
      itemTotal : undefined, // 商品总金额，假设没有数据
      itemStatus : orderItem?.tradeStatus?.[0]?.content?.[0]?.value?.text || orderItem?.tradeStatus?.[0]?.content?.[0]?.value || "", // 子订单状态，如果缺失默认为空
      itemOrderNo : orderItem.id, // 订单号，确保有值
    };
    if (!isNum(orderItemDetail.originalPrice)) {
      orderItemDetail.originalPrice = 0;
    }
    if (orderItemDetail.itemStatus == "退款") {
      orderItemDetail.itemStatus == "退款成功"
    }
    // 将订单项详情添加到 orderItemMap 中
    if (orderItemDetail.itemOrderNo) {
      orderItemMap[orderItemDetail.itemOrderNo] = orderItemDetail;
    }
  }

  //其他抵扣金额,1.红包抵扣 2淘金币抵扣
  var actualFee = order.actualFee;
  var redEnvelopeFee = toMoney((((_rawOrder?.mainOrder?.payInfo?.feeMess?.find(feeMess => feeMess?.name?.includes("红包"))) || {})?.value)?.replace('￥', '') || 0);
  actualFee = actualFee - redEnvelopeFee;
  var goldCoinFee = toMoney((((_rawOrder?.mainOrder?.payInfo?.feeMess?.find(feeMess => feeMess?.name?.includes("淘金币"))) || {})?.value)?.replace('￥', '') || 0);
  actualFee = toMoney(actualFee - goldCoinFee);
  order.actualFee = actualFee;

  var totalItemAmount = 0; // 用于计算所有子订单的总金额
  // 计算所有子订单的原价总金额
  for (let itemOrderNo in orderItemMap) {
    const orderItemDetail = orderItemMap[itemOrderNo];
    // 计算单个子订单的金额：原价 * 数量
    const itemAmount = toMoney(parseFloat(orderItemDetail.originalPrice) * orderItemDetail.quantity);
    totalItemAmount += Number(itemAmount);
  }
  // 计算每个子订单的实际付款金额
  for (let itemOrderNo in orderItemMap) {
    const orderItemDetail = orderItemMap[itemOrderNo];
    if (totalItemAmount > 0) {
      // 按比例计算实际付款金额
      const actualPrice = toMoney((parseFloat(orderItemDetail.originalPrice) / totalItemAmount) * actualFee);
      orderItemDetail.actualFee = toMoney(actualPrice); // 保留两位小数
    } else {
      // 如果总金额为0，则实际付款为0
      orderItemDetail.actualFee = 0;
    }
    orderItemMap[itemOrderNo] = orderItemDetail;
  }

  //物流信息
  var packageInfos = _rawOrder?.packageInfos;
  var deliveryInfo = {};
  deliveryInfo.address = _rawOrder?.deliveryInfo?.address;
  deliveryInfo.warehouse = warehouse(deliveryInfo?.address);
  for (const itemOrderNo of Object.keys(orderItemMap)) {
    orderItemMap[itemOrderNo].address = deliveryInfo?.address;
    orderItemMap[itemOrderNo].warehouse = deliveryInfo?.warehouse;
  }
  if (isEmpty(packageInfos)) {
    //单个快递
    deliveryInfo.deliveryName = _rawOrder?.deliveryInfo?.logisticsName;
    deliveryInfo.deliveryNo = _rawOrder?.deliveryInfo?.logisticsNum;
    for (const itemOrderNo of Object.keys(orderItemMap)) {
      if (deliveryInfo?.deliveryName && deliveryInfo?.deliveryName != '—') {
        orderItemMap[itemOrderNo].deliveryName = deliveryInfo?.deliveryName;
      }
      if (deliveryInfo?.deliveryNo && deliveryInfo?.deliveryNo != '—') {
        orderItemMap[itemOrderNo].deliveryNo = deliveryInfo?.deliveryNo;
      }
    }
  } else {
    //多个物流
    var deliveryInfos = packageInfos?.list;
    for (const deliveryInfoi of deliveryInfos) {
      for (const deliveryDetail of deliveryInfoi?.details) {
        var itemOrderNo = deliveryDetail?.snapUrl;
        itemOrderNo = itemOrderNo.substring(itemOrderNo.lastIndexOf("=") + 1);
        if (deliveryInfoi?.companyName && deliveryInfoi?.companyName != '—') {
          orderItemMap[itemOrderNo].deliveryName = deliveryInfoi?.companyName;
        }
        if (deliveryInfoi?.invoiceNo && deliveryInfoi?.invoiceNo != '—') {
          orderItemMap[itemOrderNo].deliveryNo = deliveryInfoi?.invoiceNo;
        }
      }
    }
  }

  if (isEmpty(order)) {
    order = {
      orderNo : orderNo,
      items : Object.values(orderItemMap),
    };
  } else {
    for (let i = 0; i < order?.items.length; i++) {
      var itemOrderNo = order?.items[i]?.itemOrderNo;
      if (itemOrderNo in orderItemMap) {
        order.items[i] = mergeObj(order?.items[i], orderItemMap[itemOrderNo]);
      }
    }
  }
  console.log("【订单详情数据】" + jsonString(order));
  setOrder(order);

  //获取子订单日期、空格、店铺名称、子订单号、型号、码数、价格、数量、空格、空格、物流、状态、仓库，多行分行，复制到粘贴板
  var orderDetailText = "";
  for (let i = 0; i < order?.items.length; i++) {
    var itemOrderNo = order?.items[i]?.itemOrderNo;
    var itemOrder = getOrderItem(order, itemOrderNo);
    console.log("粘贴订单数据" + JSON.stringify(itemOrderNo))
    console.log("订单来源" + sourceName(nickName))
    console.log("订单来源" + nickName)
    if (itemOrder) {
      orderDetailText +=
        order.createDay + "\t" +
        sourceName(nickName) + "\t" +
        order.shopName + "\t" +
        order.orderNo + "\t" +
        itemOrder.name + "\t" +
        itemOrder.spec + "\t" +
        itemOrder.size + "\t" +
        itemOrder.actualFee + "\t" +
        itemOrder.quantity + "\t" +
        "\t" +
        "\t" +
        itemOrder.deliveryNo + "\t" +
        itemOrder.itemStatus + "\t" +
        itemOrder.warehouse + "\n";
    }
  }
  //油猴复制到粘贴板
  if (orderDetailText != "") {
    GM_setClipboard(orderDetailText);
  }
}

//获取天猫详情json数据
function parseTmallOrderDetailRawJson(_rawText) {
  var beginIndex = _rawText.indexOf("var detailData = ")
  var lastIndex = _rawText.indexOf("</script>", beginIndex);
  var dataText = _rawText.substring(beginIndex + ("var detailData = ").length, lastIndex);
  dataText = dataText.replace(/\\"/g, '"');
  dataText = dataText.replace(/\\\\"/g, '\\"');
  console.log("【订单详情数据】\n" + dataText)
  var orderDetailRaw = parseJSON(dataText);
  return extractTmallOrderDetailData(orderDetailRaw);
}

function extractTmallOrderDetailData(_rawOrder) {
  //子订单信息
  var orderNo = _rawOrder.orders.id;
  var order = getOrder(orderNo);
  var orderItemMap = {};
  var itemOrders = _rawOrder.orders.list;

  //地址信息
  var deliveryInfo = {};
  deliveryInfo.address =
    (_rawOrder.basic.lists.find(content => content.key.includes("收货地址"))?.content?.[0]?.text) || "";
  deliveryInfo.warehouse = warehouse(deliveryInfo.address);

  //处理子订单信息
  for (let i = 0; i < itemOrders.length; i++) {
    //物流信息
    var deliveryInfoi = {
      deliveryName : itemOrders[i]?.logistic?.content?.[0]?.companyName,
      deliveryNo : itemOrders[i]?.logistic?.content?.[0]?.mailNo,
    }
    console.log("获取到的物流数据" + deliveryInfoi.deliveryNo)

    //多个物品订单信息
    var orderItemDetails = itemOrders[i].status;
    console.log("获取到的订单数据" + jsonString(orderItemDetails))

    for (const orderItemDetailRawJson of orderItemDetails) {
      var subOrderItemInfoRaw = orderItemDetailRawJson.subOrders?.[0].itemInfo;
      var itemOrderNo = getUrlParam("http:" + subOrderItemInfoRaw.snapUrl, "tradeID");
      console.log("订单号码：" + itemOrderNo)
      var orderItem = getOrderItem(order, itemOrderNo);
      const subOrderItemDetail = {
        name : subOrderItemInfoRaw.title, // 商品名称
        spec : (subOrderItemInfoRaw?.skuText?.find(spec => spec?.key?.includes("颜色"))?.content?.[0]?.text) || (subOrderItemInfoRaw?.extra?.find(spec => spec?.name.includes("商家编码")) || {}).value || "", // 商品规格
        size : (subOrderItemInfoRaw?.skuText?.find(spec => spec?.key?.includes("尺码") || spec?.key?.includes("鞋码"))?.content?.[0]?.text) || "", // 码数
        originalPrice : ((orderItemDetailRawJson?.subOrders?.[0]?.priceInfo?.[0]?.text) || orderItem?.originalPrice || "0")?.replace('￥', ''), // 单价，采用订单列表的
        quantity : parseInt(orderItemDetailRawJson?.subOrders?.[0]?.quantity, 10), // 数量
        returnQuantity : undefined,
        itemTotal : undefined,
        itemStatus : orderItemDetailRawJson?.statusInfo?.[0]?.text,//子订单状态
        itemOrderNo : itemOrderNo
      }
      console.log("天猫子订单数据：" + jsonString(subOrderItemDetail))

      subOrderItemDetail.address = deliveryInfo?.address;
      subOrderItemDetail.warehouse = deliveryInfo?.warehouse;
      subOrderItemDetail.deliveryName = deliveryInfoi?.deliveryName;
      subOrderItemDetail.deliveryNo = deliveryInfoi?.deliveryNo;

      orderItemMap[subOrderItemDetail.itemOrderNo] = subOrderItemDetail;
      console.log("天猫子订单end：" + jsonString(orderItemMap[subOrderItemDetail.itemOrderNo]))
    }
  }

  //其他抵扣金额,1.购物金 2.红包
  var actualFee = toMoney(order.actualFee);
  var shoppingGoldFee = toMoney((((_rawOrder?.amount?.count?.[0]?.find(content => content?.content?.[0]?.data?.titleLink?.text?.includes("购物金"))) || {})?.content?.[0]?.data?.money?.text)?.replace('￥', '') || 0);
  actualFee = actualFee - shoppingGoldFee;
  // var redEnvelopeFee = toMoney((((_rawOrder?.amount?.count?.[0]?.find(content => content?.content?.[0]?.data?.titleLink?.text?.includes("红包"))) || {})?.content?.[0]?.data?.money?.text)?.replace('￥', '') || 0);
  // actualFee = toMoney(actualFee - redEnvelopeFee);
  order.actualFee = actualFee;

  var totalItemAmount = 0; // 用于计算所有子订单的总金额
  // 计算所有子订单的原价总金额
  for (let itemOrderNo in orderItemMap) {
    const orderItemDetail = orderItemMap[itemOrderNo];
    // 计算单个子订单的金额：原价 * 数量
    const itemAmount = parseFloat(orderItemDetail.originalPrice) * orderItemDetail.quantity;
    totalItemAmount += Number(itemAmount);
  }
  // 计算每个子订单的实际付款金额
  for (let itemOrderNo in orderItemMap) {
    const orderItemDetail = orderItemMap[itemOrderNo];
    if (totalItemAmount > 0) {
      // 按比例计算实际付款金额，此处为计算单价
      const actualPrice = (orderItemDetail.originalPrice / totalItemAmount) * actualFee;
      orderItemDetail.actualFee = toMoney(actualPrice); // 保留两位小数
    } else {
      // 如果总金额为0，则实际付款为0
      orderItemDetail.actualFee = 0;
    }
    orderItemMap[itemOrderNo] = orderItemDetail;
  }

  if (isEmpty(order) || isEmpty(order.items)) {
    order = {
      orderNo : orderNo,
      items : Object.values(orderItemMap),
    };
  } else {
    for (let i = 0; i < order.items.length; i++) {
      var itemOrderNoi = order.items[i].itemOrderNo;
      if (itemOrderNoi in orderItemMap) {
        order.items[i] = mergeObj(order.items[i], orderItemMap[itemOrderNoi]);
        console.log("天猫设置子订单数据：" + jsonString(order.items[i]))
      }
    }
  }
  setOrder(order);

  //获取子订单日期、空格、店铺名称、子订单号、型号、码数、价格、数量、空格、空格、物流、状态、仓库，多行分行，复制到粘贴板
  var orderDetailText = "";
  for (let i = 0; i < order?.items.length; i++) {
    var itemOrderNo = order?.items[i]?.itemOrderNo;
    var itemOrder = getOrderItem(order, itemOrderNo);
    console.log("粘贴订单数据" + JSON.stringify(itemOrderNo))
    if (itemOrder) {
      orderDetailText +=
        order.createDay + "\t" +
        sourceName(nickName) + "\t" +
        order.shopName + "\t" +
        order.orderNo + "\t" +
        itemOrder.name + "\t" +
        itemOrder.spec + "\t" +
        itemOrder.size + "\t" +
        itemOrder.actualFee + "\t" +
        itemOrder.quantity + "\t" +
        "\t" +
        "\t" +
        itemOrder.deliveryNo + "\t" +
        itemOrder.itemStatus + "\t" +
        itemOrder.warehouse + "\n";
    }
  }
  //油猴复制到粘贴板
  if (orderDetailText != "") {
    GM_setClipboard(orderDetailText);
  }
}

//清除数据
function cleanLocalData() {
  var keys = GM_listValues();
  console.info("清空前的本地数据:" + jsonString(keys));
  for (const keyi of keys) {
    GM_deleteValue(keyi);
  }
  console.info("清空后的本地数据:" + jsonString(GM_listValues()));
}

//导出订单数据
function exportOrdersList() {
  var orders = getOrders();
  orders = orders.sort((a, b) => {
    // 比较时间，按时间倒序排序
    const timeDiff = new Date(b.createTime) - new Date(a.createTime);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    // 如果时间相同，按订单号升序排序
    return a.orderNo.localeCompare(b.orderNo);
  });
  toCsv(orders);
}

//转换为csv数据
function toCsv(_orderList) {
  const header = ["下单日期", "发货渠道", "店铺名称", "订单编号", "商品名称", "商品规格", "码数", "单价", "数量", "退货数量", "总计", "物流号", "得物状态", "仓库", "商品主图", "商品链接", "交易快照", "单价", "数量", "退款状态", "实付款", "交易状态", "订单详情链接", "快照商品名称", "地址", "仓库", "物流", "物流号", "购物金", "实付款"];

  let rows = "";
  let row = header.join(",");
  rows += row + "\n";

  for (const order of _orderList) {
    console.log("导出的订单数据：" + jsonString(order))
    for (const item of order.items) {
      console.log("导出的订单数据item：" + jsonString(item))
      row = "";
      row += formatCsvStr(order.createDay) + ",";
      row += formatCsvStr(sourceName(nickName)) + ",";
      row += formatCsvStr(order.shopName) + ",";
      row += formatCsvStr(order.orderNo) + ",";
      row += formatCsvStr(item.name) + ",";
      row += formatCsvStr(item.spec) + ",";
      row += formatCsvStr(item.size) + ",";
      row += formatCsvStr(item.actualFee) + ",";
      row += formatCsvStr(item.quantity) + ",";
      row += formatCsvStr(item.returnQuantity) + ",";
      row += ",";
      row += formatCsvStr(item.deliveryNo) + ",";
      row += formatCsvStr(item.itemStatus) + ",";
      row += formatCsvStr(item.warehouse) + ",";
      rows += row + "\n";
    }
  }

  var dateTime = new Date();
  var dateTimeFullMonth = dateTime.getMonth() + 1;
  var dateTimeFullDay = dateTime.getDate();
  dateTimeFullMonth = dateTimeFullMonth < 10 ? "0" + dateTimeFullMonth : dateTimeFullMonth;
  dateTimeFullDay = dateTimeFullDay < 10 ? "0" + dateTimeFullDay : dateTimeFullDay;
  const dateStr = dateTime.getFullYear() + "-" + dateTimeFullMonth + "-" + dateTimeFullDay;
  const timeStr = dateTime.getHours() + "-" + dateTime.getMinutes() + "-" + dateTime.getSeconds();
  const filename = "淘宝买家订单数据导出_" + dateStr + "_" + timeStr;

  let blob = new Blob(["\ufeff" + rows], {type : "text/csv;charset=utf-8;"});
  let encodedUrl = URL.createObjectURL(blob);
  let url = document.createElement("a");
  url.setAttribute("href", encodedUrl);
  url.setAttribute("download", filename + ".csv");
  document.body.appendChild(url);
  url.click();
}

function setOrder(_order) {
  console.log("【将要保存的订单数据】\n" + JSON.stringify(_order))
  if (isEmpty(_order?.orderNo)) {
    return;
  }

  console.log("订单号：" + _order.orderNo);
  var order = getOrder(_order.orderNo);
  console.log("【系统原有的订单数据】\n" + JSON.stringify(order))
  order = mergeObj(order, _order);
  console.log("【系统最新保存的订单数据】\n" + JSON.stringify(order))
  GM_setValue("order_" + order.orderNo, order);
}

function setOrders(_orders) {
  console.log("【将要保存的订单列表数据】\n" + JSON.stringify(_orders))
  if (isEmpty(_orders) || isEmpty(_orders)) {
    return;
  }
  for (const order of _orders) {
    setOrder(order)
  }
}

function getOrder(_orderNo) {
  if (isEmpty(_orderNo)) {
    return {};
  }
  var orderDetail = GM_getValue("order_" + _orderNo);
  return isEmpty(orderDetail) ? {} : orderDetail;
}

function getOrders() {
  var orderList = getKeyPrefixValues("order_");
  if (isEmpty(orderList)) {
    orderList = [];
  }
  return orderList;
}

function getOrderItem(_order, _itemOrderNo,) {
  if (isEmpty(_order) || isEmpty(_order.items) || isEmpty(_itemOrderNo)) {
    return {};
  }
  for (let i = 0; i < _order.items.length; i++) {
    if (_itemOrderNo == _order.items[i].itemOrderNo) {
      return _order.items[i];
    }
  }
}

function getKeyPrefixValues(_keyPrefix) {
  let allKeys = GM_listValues();
  var datas = [];

  allKeys.forEach(key => {
    if (key.startsWith(_keyPrefix)) {
      let value = GM_getValue(key);
      datas.push(value);
    }
  });

  return datas;
}

function wrapNumbersWithQuotes(inputString) {
  // 正则表达式，匹配以:开头，贪婪匹配最多的数字10-40位，最后是以逗号,结束
  const regex = /:(\d{10,40}),/g;
  // 使用 replace 方法，替换匹配到的字符串
  return inputString.replace(regex, (match) => {
    // 用双引号包裹匹配到的数字
    return `:"${match.slice(1, -1)}",`;
  });
}

function parseJSON(_jsonRaw) {
  return JSON.parse(wrapNumbersWithQuotes(_jsonRaw));
}

function jsonString(_jsonObject) {
  return JSON.stringify(_jsonObject);
}

function formatCsvStr(_value) {
  //防止长数字被格式化
  if (isNum(_value) && _value.length > 8) {
    return `="${_value}"`;
  }
  if (isEmpty(_value)) {
    return "";
  }
  //替换逗号，防止csv中的逗号分隔符
  if (!isNum(_value) && _value) {
    _value = _value.replaceAll(",", " ");
  }
  return _value;
}

function sourceName(_nickName) {
  if (isEmpty(_nickName)) {
    return "";
  }
  if (_nickName.includes("泳天幻少")) {
    return "淘宝1";
  } else if (_nickName.includes("zzqyu657")) {
    return "洁红淘宝";
  } else if (_nickName.includes("fashion_suhj")) {
    return "淘宝2";
  } else if (_nickName.includes("17324472089哈哈")) {
    return "淘宝3";
  } else if (_nickName.includes("tabao4windy")) {
    return "淘宝4";
  } else if (_nickName.includes("lingyu100")) {
    return "洁莹淘宝";
  }
}