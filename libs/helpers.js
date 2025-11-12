const isExists = function(object, path) {

    let parts = [];

    if(isString(path)) {
        parts = path.split('.');
    }
    else if(isFilledArray(path)) {
        parts = path;
    }

    let testObject = object;

    for(let i = 0, end = parts.length; i < end; i++) {

        if(isScalar(testObject) || typeof(testObject[parts[i]]) === 'undefined') {
            return false;
        }

        testObject = testObject[parts[i]];
    }

    return true;
};

const getValue = function(object, path, defValue) {

    let parts = [];

    if(isString(path)) {
        parts = path.split('.');
    }
    else if(isFilledArray(path)) {
        parts = path;
    }

    let testObject = object;

    for(let i = 0, end = parts.length; i < end; i++) {
        if(isScalar(testObject) || isNoValue(testObject) || typeof(testObject[parts[i]]) === 'undefined') {
            return defValue;
        }

        testObject = testObject[parts[i]];
    }

    return testObject;
}

const isNoValue = function(value) {
    return value === undefined || value === null;
}

const isString = function(value) {
    return typeof(value) === 'string';
}

const isNumeric = function(value) {
    return typeof(value) === 'number';
}

const isBoolean = function(value, smart = false) {
    return typeof(value) === 'boolean' || (smart && ['yes', 'on', 'true', '1', 'no', 'off', 'false', '0'].indexOf(String(value).toLowerCase()) > - 1);
}

const isTRUE = function(value) {
    return value === true || ['yes', 'on', 'true', '1'].indexOf(String(value).toLowerCase()) > -1;
}

const isScalar = function(value) {
    return ['object', 'undefined'].indexOf(typeof(value)) === -1;
}

const TYPES = Object.freeze({
    SCALAR: 1,
    EMPTY: 2,
    ARRAY: 3,
    OBJECT: 4,
    UNKNOWN: 5
});

const getType = function(value) {
    if(isScalar(value)) {
        return TYPES.SCALAR;
    }
    else if(isNoValue(value)) {
        return TYPES.EMPTY;
    }
    else if(isArray(value)) {
        return TYPES.ARRAY;
    }
    else if(isPlainObject(value)) {
        return TYPES.OBJECT;
    }

    return TYPES.UNKNOWN;
}

const isArray = Array.isArray ? Array.isArray : function(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
}

const isFilledArray = function(value) {
    return isArray(value) && value.length;
}

const isPlainObject = function(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

const isFilledPlainObject = function(value) {
    return isPlainObject(value) && Object.keys(value).length;
}

const isFunction = function(value) {
    return typeof(value) === 'function';
}

const onlyProps = function(object, onlyProps)
{
    const result = {};
    if(isFilledPlainObject(object) && isFilledArray(onlyProps)) {
        Object.keys(object).forEach(prop => {
            if(onlyProps.indexOf(prop) > -1) {
                result[prop] = object[prop];
            }
        });

        return result;
    }

    return null;
}

const randomString = function(len = 10) {
    let text = '';

    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for(let i = 0; i < len; i++)
    {
        text+= charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return text;
}

const sort = function(keys) {
    return keys.sort((a, b) => {
        const aNum = Number(a);
        const bNum = Number(b);
        const aIsNum = !isNaN(aNum) && a.trim() !== "";
        const bIsNum = !isNaN(bNum) && b.trim() !== "";

        // 1. If both numeric → compare numerically
        if (aIsNum && bIsNum) {
            return aNum - bNum;
        }

        // 2. If one numeric and one string → numeric comes first
        if (aIsNum && !bIsNum) return -1;
        if (!aIsNum && bIsNum) return 1;

        // 3. compare as strings (binary-safe, case-sensitive)
        if (a < b) return -1;
        if (a > b) return 1;

        return 0;
    });
}

module.exports = {
    isExists,
    getValue,
    isScalar,
    isString,
    isNumeric,
    isBoolean,
    isNoValue,
    isFunction,
    isArray,
    isFilledArray,
    isPlainObject,
    isFilledPlainObject,
    isTRUE,
    onlyProps,
    randomString,
    getType,
    sort,
    TYPES
}
