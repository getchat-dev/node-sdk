const isExists = function(object, path) {

    let parts = [];

    if(this.isString(path)) {
        parts = path.split('.');
    }
    else if(this.isFilledArray(path)) {
        parts = path;
    }

    let testObject = object;

    for(let i = 0, end = parts.length; i < end; i++) {

        if(this.isScalar(testObject) || typeof(testObject[parts[i]]) === 'undefined') {
            return false;
        }

        testObject = testObject[parts[i]];
    }

    return true;
};

const getValue = function(object, path, defValue = null) {

    let parts = [];

    if(this.isString(path)) {
        parts = path.split('.');
    }
    else if(this.isFilledArray(path)) {
        parts = path;
    }

    let testObject = object;

    for(let i = 0, end = parts.length; i < end; i++) {

        if(this.isScalar(testObject) || typeof(testObject[parts[i]]) === 'undefined') {
            return defValue;
        }

        testObject = testObject[parts[i]];
    }

    return testObject;
}

const isString = function(value) {
    return typeof(value) === 'string';
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

module.exports = {
    isExists,
    getValue,
    isScalar,
    isString,
    isBoolean,
    isFunction,
    isArray,
    isFilledArray,
    isPlainObject,
    isFilledPlainObject,
    isTRUE,
    onlyProps
}
