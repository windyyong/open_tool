/**
 * 公共下载地址：http://117.50.172.235/tampermonkey_common.js
 * 文件地址：/www/wwwroot/html_static/tampermonkey_common.js
 1.需要引入https://cdn.bootcdn.net/ajax/libs/lodash.js/4.17.21/lodash.min.js
 @description 1.20250411 修改参数方法getUrlParam
 **/

//判断js对象是否为空
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

//是否数字
function isNum(_value) {
    return !isNaN(parseFloat(_value)) && isFinite(_value);
}

//获取随机整数
function getRandomInteger(min, max) {
    // 包含 min 和 max
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//获取链接参数
function getUrlParam(_url, _key) {
    //截取?后的参数
    if (_url.includes("?")) {
        _url = _url.split("?")[1];
    }
    const params = new URLSearchParams(_url);

    var result = undefined;
    params.forEach((value, key) => {
        console.log(key + ":" + value)
        console.log(key == _key)
        if (key == _key) {
            result = value;
        }
    });
    return result;
}

// 使用while循环，delay表示毫秒
function sleepSSSSSSSS(delay) {
    var start = new Date().getTime();
    while (new Date().getTime() - start < delay) {
    }
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

//需要引入https://cdn.bootcdn.net/ajax/libs/lodash.js/4.17.21/lodash.min.js
function mergeObj(_source, _target) {
    return _.merge({}, _source, _target);
}

//返回内部txt
function returnInnerText(_block) {
    return _block === null ? "" : _block.innerText;
}

//返回属性
function returnAttr(_block, _attr) {
    return _block === null ? "" : _block.getAttribute(_attr);
}

//转换为金额
function toMoney(_str) {
    if (isEmpty(_str)) {
        return Number(0);
    }
    return parseFloat(_str).toFixed(2);
}

//电商相关
//判断仓库
function warehouse(_address) {
    if (!_address) {
        return;
    }
    if (_address.includes("东莞")) {
        return '自家仓库';
    } if (_address.includes("深圳")) {
        return '洁红家';
    } else if (_address.includes("山门大道700号") || ( _address.includes("化龙镇"))) {
        return '广州700'
    } else if (_address.includes("永大路99号")) {
        return '广州99'
    } else if (_address.includes("广兴路9999号") || (_address.includes("广州") && _address.includes("南沙"))) {
        return '广州9999'
    } else if (_address.includes("临空北路100号") || (_address.includes("武汉") && _address.includes("横店"))) {
        return '武汉'
    } else if (_address.includes("彭封路333号")) {
        return '上海333'
    } else if (_address.includes("丰登路7777号")) {
        return '上海7777'
    } else if (_address.includes("龙盘路888号")) {
        return '上海888'
    } else if (_address.includes("银丽路800号")) {
        return '上海800'
    } else if (_address.includes("富文道888号") || (_address.includes("廊坊") && _address.includes("仇庄乡"))) {
        return '廊坊'
    } else if (_address.includes("窑村8888号") || (_address.includes("西安") && _address.includes("斜口街道"))) {
        return '西安'
    } else if (_address.includes("南六路1号") || (_address.includes("成都") && _address.includes("龙泉驿区"))) {
        return '成都'
    }
}

//linux查找文件名为common.js的文件
//find / -name common.js