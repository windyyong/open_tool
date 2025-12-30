// ==UserScript==
// @name         拼多多脚本
// @version      1.0.2
// @author       windy
// @match        https://mobile.yangkeduo.com/orders.html*
// @match        https://mobile.yangkeduo.com/order.html*
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.15/lodash.min.js
// @require      https://cdn.jsdelivr.net/gh/windyyong/open_tool@main/youhou/common/tampermonkey_common.js
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @license      MIT
// ==/UserScript==

/**
 * 1.订单GM_setValue中，key为order_订单号，value为订单数，主要防止多个页面访问导致的数据覆盖问题
 *
 */

  //订单详情链接
var orderDetailUrlPrefix="https://mobile.yangkeduo.com/order.html?order_sn=";//订单详情链接
var orderListUrlPrefix="https://mobile.yangkeduo.com/orders.html?type=";//订单列表链接
var openDetailUrls=[];//打开的订单详情url

if(document.URL.startsWith(orderListUrlPrefix)){
    //监听订单数据
    handleXMLResult();
}

window.addEventListener('load', function() {
    // 加载完成后执行的代码
    if(document.URL.startsWith(orderDetailUrlPrefix)){
        orderDetailPage();//订单详情页面
    }else if(document.URL.startsWith(orderListUrlPrefix)){
        orderListComponent();//加载页面按钮
        orderFirstPage();//加载第一页数据
        handleXMLResult();//监听订单接口数据
    }
}, false);


//加载页面组件
function orderListComponent(){
    const buttonDiv = document.createElement("div");
    buttonDiv.id='function-div';
    buttonDiv.style="position: fixed;top: 50%;right: 0;transform: translateY(-50%);background-color: lightblue;padding: 10px;box-shadow: 0 0 10px rgba(0,0,0,0.5);";
    document.body.appendChild(buttonDiv)
    addButton(buttonDiv, orderListDownload, "下载订单", "download-btn");
    addButton(buttonDiv, clearOrderList, "清除订单", "clear-btn");

    //添加按钮
    function addButton(element, onclickFunc, text = "按钮", id, width = "200px", height = "50px") {
        const button = document.createElement("input");

        button.id = id;
        button.type = "button";
        button.value = text;
        button.style.height = height;
        button.style.width = width;
        button.style.align = "center";
        button.style.marginLeft = "0px";
        button.style.marginTop = "10px";
        button.style.marginRight = "5px";
        button.style.color = "white";
        button.style.background = "#409EFF";
        button.style.border = "1px solid #409EFF";
        button.style.fontSize = "1.5em";
        button.onclick = function () {
            onclickFunc();
        };

        element.appendChild(button);
    }
}

//处理http请求结果
function handleXMLResult(){
    addXMLRequestCallback(function (xhr) {
        xhr.addEventListener("load", function () {
            if (xhr.readyState == 4 && xhr.status == 200) {
                //订单列表接口
                if(xhr.responseURL.startsWith("https://mobile.yangkeduo.com/proxy/api/api/aristotle/order_list_v4")){
                    handleOrderListData(xhr.responseText);
                }
            }
        });
    });

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
}

function openPage(url) {
    if(openDetailUrls.indexOf(url)>=0){
        return;
    }
    openDetailUrls.push(url);
    GM_openInTab(url, {active : false, insert : true, setParent : true}) // 打开新的tab
}

//处理订单接口数据
function handleOrderListData(_responseText){
    var orders=(JSON.parse(_responseText)).orders;
    for (let i = 0; i < orders.length; i++) {
        var orderData={};
        orderData.orderNo=orders[i].order_sn;
        orderData.orderAmount=orders[i].display_amount;
        if(isNum(orderData.orderAmount)){
            orderData.orderAmount=orderData.orderAmount/100;
        }
        orderData.orderDiscountAmount=orders[i].discount_amount;
        if(isNum(orderData.orderDiscountAmount)){
            orderData.orderDiscountAmount=orderData.orderDiscountAmount/100;
        }
        orderData.status=orders[i].status;
        orderData.orderStatus=orders[i].order_status;
        orderData.payStatus=orders[i].pay_status;
        if(orders[i].order_time){
            orderData.orderTime=timestampToDate(orders[i].order_time*1000)
        }else if (orders[i]?.group_order?.success_time){
            orderData.orderTime=timestampToDate(orders[i].group_order.success_time*1000)
        }
        orderData.orderLinkUrl=orders[i].order_link_url;

        //店铺名称
        orderData.shopName=orders[i].mall?.mall_name;

        var goodData=(orders[i].order_goods)?((orders[i].order_goods)[0]):(orders[i].orders[0].order_goods[0]);
        orderData.goodId=goodData?.goods_id;
        orderData.skuId=goodData?.sku_id;
        orderData.goodsName=goodData?.goods_name;
        orderData.goodsNumber=goodData?.goods_number;
        orderData.goodsPrice=goodData?.goods_price;
        if(isNum(orderData.goodsPrice)){
            orderData.goodsPrice=orderData.goodsPrice/100;
        }
        orderData.spec=goodData?.spec;

        orderData.orderItemAmount=toMoney(orderData.orderAmount/orderData.goodsNumber)

        if(!isEmpty(orderData)){
            setOrderDetail(orderData);
            if(!isEmpty(orderData.orderLinkUrl)){
                console.log(orderData.orderLinkUrl);
                openPage("https://mobile.yangkeduo.com/"+orderData.orderLinkUrl);
            }
        }
    }
}


function orderFirstPage(){
    const bodyText = document.body.innerHTML;
    var beginIndex = bodyText.indexOf("window.rawData=")
    var lastIndex = bodyText.indexOf("window.leo=")
    var dataText = bodyText.substring(beginIndex + ("window.rawData=").length, lastIndex);
    var unuselessIndex = dataText.lastIndexOf(";");
    dataText = dataText.substring(0, unuselessIndex);
    console.log("【当前订单数据数据】\n"+dataText)
    var orderRawData= (JSON.parse(dataText));
    if(isEmpty(orderRawData)){
        alert("页面异常，订单数据为空")
        return;
    }

    var orderFirstList=orderRawData.ordersStore.orders;
    if(isEmpty(orderFirstList)||orderFirstList.length==0){
        alert("页面异常，订单数据为空")
        return;
    }

    for (let i = 0; i < orderFirstList.length; i++) {
        var orderData={};
        console.log("【当前订单】"+JSON.stringify(orderFirstList[i]))
        orderData.orderNo=orderFirstList[i].orderSn;
        orderData.orderAmount=orderFirstList[i].displayAmount;
        if(isNum(orderData.orderAmount)){
            orderData.orderAmount=orderData.orderAmount/100;
        }
        orderData.orderDiscountAmount=orderFirstList[i].discountAmount;
        if(isNum(orderData.orderDiscountAmount)){
            orderData.orderDiscountAmount=orderData.orderDiscountAmount/100;
        }
        orderData.status=orderFirstList[i].status;
        orderData.orderStatus=orderFirstList[i].orderStatus;
        orderData.payStatus=orderFirstList[i].payStatus;
        if(orderFirstList[i].orderTime){
            orderData.orderTime=timestampToDate(orderFirstList[i].orderTime*1000)
        }
        orderData.orderLinkUrl=orderFirstList[i].orderLinkUrl;

        //店铺名称
        orderData.shopName=orderFirstList[i]?.mall?.mallName;

        var goodData=(orderFirstList[i].orderGoods)[0];
        orderData.goodId=goodData?.goodsId;
        orderData.skuId=goodData?.skuId;
        orderData.goodsName=goodData?.goodsName;
        orderData.goodsNumber=goodData?.goodsNumber;
        orderData.goodsPrice=goodData?.goodsPrice;
        orderData.spec=goodData?.spec;
        orderData.orderItemAmount=toMoney(orderData.orderAmount/orderData.goodsNumber)


        if(!isEmpty(orderData)){
            setOrderDetail(orderData);
            if(!isEmpty(orderData.orderLinkUrl)){
                console.log(orderData.orderLinkUrl);
                //睡眠0.1秒，确保上述数据已设置
                sleepSSSSSSSS(100)
                openPage("https://mobile.yangkeduo.com/"+orderData.orderLinkUrl);
            }
        }
    }
}

function orderDetailPage(){
    const bodyText = document.body.innerHTML;
    var beginIndex = bodyText.indexOf("window.rawData=")
    var lastIndex = bodyText.indexOf("window.leo=")
    var dataText = bodyText.substring(beginIndex + ("window.rawData=").length, lastIndex);
    var unuselessIndex = dataText.lastIndexOf(";");
    dataText = dataText.substring(0, unuselessIndex);
    console.log("【当前订单数据数据】\n"+dataText)
    var orderRawData= (JSON.parse(dataText)).data;
    if(isEmpty(orderRawData)){
        alert("页面异常，订单数据为空")
        return;
    }

    var orderDetail=getOrderDetail(orderRawData.orderSn);
    if(isEmpty(orderDetail)){
        orderDetail={};
    }else{
        console.log("系统存在数据："+JSON.stringify(orderDetail))
    }

    //填充数据
    orderDetail.orderNo=orderRawData.orderSn;
    orderDetail.express=orderRawData?.expressInfo?.shippingName;
    orderDetail.expressNo=orderRawData?.expressInfo?.trackingNumber;
    orderDetail.receiveName=orderRawData?.receiveName;
    orderDetail.mobile=orderRawData?.mobile;
    orderDetail.provinceName=orderRawData?.provinceName;
    orderDetail.cityName=orderRawData?.cityName;
    orderDetail.districtName=orderRawData?.districtName;
    orderDetail.shippingAddress=orderRawData?.shippingAddress;
    orderDetail.fullAddress=orderDetail.provinceName+orderDetail.cityName+orderDetail.districtName+orderDetail.shippingAddress;
    orderDetail.warehouse=warehouse(orderDetail.fullAddress)
    setOrderDetail(orderDetail);
}

function getOrderDetail(_orderNo){
    if(isEmpty(_orderNo)){
        return {};
    }

    var orderDetail=GM_getValue("order_"+_orderNo);
    return isEmpty(orderDetail)?{}:orderDetail;
}

function getOrderList(){
    var orderList=getKeyPrefixValues("order_");
    if(isEmpty(orderList)){
        orderList=[];
    }
    return orderList;
}

function setOrderDetail(_orderDetail){
    console.log("【当前填充订单数据】\n"+JSON.stringify(_orderDetail))

    if(isEmpty(_orderDetail?.orderNo)){
        return;
    }

    var order=getOrderDetail(_orderDetail.orderNo);
    console.log("获取的订单数据:"+JSON.stringify(order))
    _orderDetail=Object.assign(order,_orderDetail);
    GM_setValue("order_"+_orderDetail.orderNo, _orderDetail);
}

function getKeyPrefixValues(_keyPrefix){
    let allKeys = GM_listValues();
    var datas=[];

    allKeys.forEach(key => {
        if(key.startsWith(_keyPrefix)){
            let value = GM_getValue(key);
            datas.push(value);
        }
    });

    return datas;
}

function isEmpty(value) {
    if (value === null || value === undefined) {
        return true;
    }
    if (typeof value === "string") {
        return value.trim() === "";
    }
    if (Array.isArray(value)) {
        return value.length === 0;
    }
    if (typeof value === "object") {
        return Object.keys(value).length === 0 && value.constructor === Object;
    }
    return false;
}

function isNum(_value) {
    return !isNaN(parseFloat(_value)) && isFinite(_value);
}


//下载订单
function orderListDownload(){
    //获取订单数据
    var orders=getOrderList();
    var newOrders=orders.sort((a, b) =>parseOrderDate(b.orderTime) - parseOrderDate(a.orderTime));

    for (let i = 0; i < newOrders.length; i++) {
        newOrders[i].statusVal=orderStatusToValue(newOrders[i].status);
    }

    console.log("下载的订单数据"+JSON.stringify(newOrders));

    var recordHeader={"orderTime":"订单时间","shopName":"商铺名称","orderNo":"订单号","goodsName":"商品名称","spec":"衣服型号","码数":"码数","orderItemAmount":"成本","goodsNumber":"商品数量", "退货数量":"退货数量","总计":"总计","expressNo":"物流号","statusVal":"状态","warehouse":"仓库", "express":"物流","expressNo":"物流号","returnCnt":"退货数量","orderAmount":"总计","remark":"备注","orderLinkUrl":"订单链接","goodUrl":"商品链接","fullAddress":"地址","orderStatus":"订单状态"};
    jsonToCsv(recordHeader,newOrders);
}

// 自定义解析函数
const parseOrderDate = (dateStr) => {
    if(isEmpty(dateStr)){
        return null;
    }
    const [datePart, timePart] = dateStr.split(', ');
    const [month, day, year] = datePart.split('/');
    const [time, period] = timePart.split(' ');
    const [hours, minutes, seconds] = time.split(':');
    const adjustedHours = period === 'PM' && hours !== '12' ? parseInt(hours, 10) + 12 : hours === '12' && period === 'AM' ? '00' : hours;
    return new Date(`${year}-${month}-${day}T${adjustedHours}:${minutes}:${seconds}`);
};


function jsonToCsv(heads, datas){
    let csv = Object.keys(heads).map(key => {
        let value = getNotNestedValue(heads, key) || '';
        return value.replace(/,/g, ' ');  // 替换逗号，防止CSV中的逗号分隔符
    }).join(',');
    csv += "\n";

    datas.forEach((row) => {

        let values=Object.keys(heads).map((key) => {
            let value=getNestedValue(row, key) || '';
            //防止长数字被格式化
            if (isNum(value) && value.length > 8) {
                value =`="${value}"`;
            }
            //替换逗号，防止csv中的逗号分隔符
            if(!isNum(value)&&value){
                value=value.replaceAll(","," ");
            }
            return value || '';
        }).join(',');
        csv +=values+ '\n' ;
    });

    var filename="拼多多订单数据";
    let blob = new Blob(["\ufeff" + csv], {type : "text/csv;charset=utf-8;"});
    let encodedUrl = URL.createObjectURL(blob);
    let url = document.createElement("a");
    url.setAttribute("href", encodedUrl);
    url.setAttribute("download", filename + ".csv");
    document.body.appendChild(url);
    url.click();
}

function timestampToDate(timestamp) {
    const date = new Date(timestamp);
    const format = "yyyy-MM-dd HH:mm:ss";
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(date);
}

//获取属性值
function getNestedValue(obj, key) {
    return key.split('.').reduce((acc, part) => {
        if (part.includes('[')) {
            const [prop, index] = part.split(/\[|\]/).filter(Boolean);
            return acc && acc[prop] ? acc[prop][index] : undefined;
        }
        return acc ? acc[part] : undefined;
    }, obj);
}

function getNotNestedValue(obj, key) {
    return obj[key]||'';
}

//清除订单数据
function clearOrderList(){
    GM_deleteValue("orderList");
}

function orderStatusToValue(_status){
    var statusMap={"2":"待发货","3":"已发货","4":"已确认收货","6":"未发货，已退款"}
    return statusMap[_status+'']||_status;
}

// 定义格式化封装函数
function formatData(timer) {
    const year = timer.getFullYear()
    const month = timer.getMonth() + 1 // 由于月份从0开始，因此需加1
    const day = timer.getDate()
    const hour = timer.getHours()
    const minute = timer.getMinutes()
    const second = timer.getSeconds()
    return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`
}
// 定义具体处理标准
// timeEl 传递过来具体的数值：年月日时分秒
// total 字符串总长度 默认值为2
// str 补充元素 默认值为"0"
function pad(timeEl, total = 2, str = '0') {
    return timeEl.toString().padStart(total, str)
}

// 使用while循环，delay表示毫秒
function sleepSSSSSSSS(delay) {
    var start = new Date().getTime();
    while (new Date().getTime() - start < delay) {
    }
}