const _ = require('./helpers');

const strRandom = function(len = 10) {

    let text = '';

    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for(let i = 0; i < len; i++)
    {
        text+= charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return text;
}

const flatten = function(obj, prefix = '', posfix = '')
{
    const data = {};

    Object.keys(obj).forEach(item => {
        if(typeof(obj[item]) === 'object') {
            const values = flatten(obj[item], '[', ']');
            if(Object.keys(values).length) {
                Object.keys(values).forEach(_item => {
                    data[`${prefix}${item}${posfix}${_item}`] = values[_item];
                })
            }
        }
        else {
            data[`${prefix}${item}${posfix}`] = obj[item];
        }
    })

    return data;
}

const _trim = function(value)
{
    return _.isString(value) ? value.trim() : value;
}

const normalizeData = function(data, filter = [])
{
    const result = {};

    if(!_.isPlainObject(data)) {
        throw new Error(`first parameter have to be a plain object type`);
    }

    let filterFields = [];

    if(_.isFilledPlainObject(filter)) {
        filterFields = Object.keys(filter);
    }
    else if(_.isFilledArray(filter)) {
        filterFields = filter;
    }

    data = Object.assign({}, data);

    if (filterFields.length)
    {
        filterFields.forEach(key => {
            if (_.isFunction( _.getValue(filter, [key, 'process']) ))
            {
                const _data = filter[key].process(data[key]);
                if(_data !== undefined) {
                    result[key] = _trim(_data);
                }
            }
            else if(_.isNoValue(data[key]))
            {
                if( _.getValue(filter, [key, 'default'], undefined) !== undefined ) {
                    result[key] = _trim(filter[key]['default']);
                }
            }
            else {
                result[key] = _trim(data[key]);
            }
        })
    }
    else { return data; }

    return result;
}

const normalizeChat = function (chat) {
    return normalizeData(chat, ['id', 'title', 'socket_port', 'create', 'type', 'metadata']);
}

const normalizeParticipant = function(participant) {
    return normalizeData(participant, { id: null, name: null, email: null, link: null, picture: null, is_bot: { default: false } });
}

const packObjectForSignature = function(obj, key = '', hasKey = true) {
    const packed = [];

    _.sort(Object.keys(obj)).forEach(k => {
        packed.push(`${key ? `${key}.` : ''}${k}=${obj[k]}`);
    });

    return packed;
}

const addToSignature = function(signature, data, filterKeys)
{
    signature = Array.prototype.slice.call(signature);

    let keys = Object.keys(data);

    if (keys.length)
    {
        if(_.isFilledArray(filterKeys)) {
            // only specified keys and in that order
            keys = filterKeys.filter(key => keys.indexOf(key) > -1);
        }
        else {
            // canonical order
            keys = _.sort(keys);
        }

        keys.forEach(key => {
            switch(_.getType(data[key])) {
                case _.TYPES.SCALAR:
                    signature.push(data[key]);
                    break;
                case _.TYPES.OBJECT:
                    packObjectForSignature(data[key], key, false).forEach(element => {
                        signature.push(element);
                    });
                    break;
            }
        });
    }

    return signature;
}

module.exports = {
    strRandom,
    flatten,
    normalizeData,
    normalizeChat,
    normalizeParticipant,
    packObjectForSignature,
    addToSignature,
};
