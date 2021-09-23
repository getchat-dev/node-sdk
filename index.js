const crypto = require('crypto');
const https = require('https');
const http = require('http');
const url = require('url');
const querystring = require('querystring');
const processUserRights = require('./libs/processUserRights');
const _ = require('./libs/helpers');

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

const normilizeData = function(data, filter = [])
{
    const result = {};

    if(!_.isPlainObject(data)) {
        throw new Error(`first parameter have to be a plain object type`);
    }

    let filterFields = [];
    let isFilterObject = false;

    if(_.isFilledPlainObject(filter)) {
        isFilterObject = true;
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

const addToSignature = function(signature, data, filterKeys)
{
    signature = Array.prototype.slice.call(signature);

    let keys = Object.keys(data);

    if (keys.length)
    {
        if(_.isFilledArray(filterKeys)) {
            keys = keys.filter(key => filterKeys.indexOf(key) > -1);
        }

        keys.sort().forEach(key => {
            signature.push(data[key])
        });
    }

    return signature;
}

class Emby {

    constructor(config = {}) {
        this.clientId = config.id;
        this.clientSecret = config.secret;
        this.apiToken = config.api_token;
        this.baseUrl = config.base_url;

        if(_.isString(this.baseUrl)) {
            this.baseUrl = this.baseUrl.replace(/\/$/g, '');
        }
    }

    requestApi(method, params = {}, type = 'get', version = 'v1')
    {
        let sParams = '';

        //let _url = `${this.baseUrl}/api/${version}/${method}?api_token=${this.apiToken}&`;
        let _url = `${this.baseUrl}/api/${version}/${method}`;

        if(!(type === 'post' || type === 'put')) {
            _url+= '?'+querystring.stringify(flatten(params))
        }

        const urlParts = url.parse(_url);

        const options = {
            method: type.toUpperCase(),
            ...(_.onlyProps(urlParts, ['hostname', 'port', 'path'])),
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiToken}`
            }
        }

        if(type === 'post' || type === 'put') {
            sParams = JSON.stringify(params);
            // options.headers['Content-Length'] = sParams.length;
        }

        return new Promise((resolve, reject) => {
            const request = (urlParts.protocol === 'https:' ? https : http).request(options, (res) => {

                if(res.statusCode === 200) {
                    let rawData = '';
                    res.setEncoding('utf8');
        
                    res.on('data', (chunk) => { rawData += chunk; });
                    res.on('end', () => {
                        try {
                            const parsedData = JSON.parse(rawData);
                            resolve(parsedData);
                        } catch (e) {
                            reject(e);
                        }
                    });
                }
                else {
                    console.error(new Error(res.statusCode, res.statusMessage));
                    reject();
                }
            })
            .on('error', (e) => {
                reject(e);
            });

            if(sParams.length) {
                request.write(sParams);
            }

            request.end();
        })
    }

    /**
     * @param Array chat
     * @param Array user
     * @param Array[] recipients
     * @param Array extra
     * @return string
     */
    urlByChatId(chat = {}, user = {}, recipients = [], extra = {})
    {
        // check chat parameter
        if(_.isPlainObject(chat)) {
            chat = normilizeData(chat, ['id', 'title', 'socket_port']);
        }
        else if(_.isString(chat)) {
            chat = {id: chat};
        }
        else {
            throw new Error('first parameter(chat) have to be a plain object or string');
        }

        if(!_.isString(chat.id)) {
            throw new Error(`chat id isn't passed`);
        }

        // check user parameter
        if(_.isPlainObject(user)) {
            user = normilizeData(user, {
                id: null,
                name: null,
                email: null,
                picture: null,
                rights: {
                    process: (data) => {
                        if (_.isFilledPlainObject(data))
                        {
                            const userRights = processUserRights(data);
                            if(userRights && Object.keys(userRights).length) {
                                return userRights;
                            }
                        }

                        return undefined;
                    }
                },
                session: {
                    process: (data) => {
                        if (!user.id) {
                            return _.isString(data) ? data : strRandom(40)
                        }

                        return undefined;
                    }
                }
            });
        }
        else {
            throw new Error('second parameter(user) have to be a plain object');
        }

        const rnd = strRandom(32);

        let signatureParams = [
            this.clientId,
            this.clientSecret,
            rnd
        ];

        const queryParams = {
            'client_id': this.clientId,
            'rnd': rnd,
            'chat': chat,
            'user': user,
            'recipients': []
        };

        signatureParams = addToSignature(signatureParams, user, ['id', 'name', 'email', 'picture']);
 
        recipients.forEach(recipient => {
            const normilizedRecipient = normilizeData(recipient, {id: null, name: null, is_bot: {default: false}});

            queryParams['recipients'].push(normilizedRecipient)
            signatureParams = addToSignature(signatureParams, normilizedRecipient, ['id', 'name']);
        });

        signatureParams = addToSignature(signatureParams, chat, ['id', 'title', 'socket_port'])

        queryParams['signature'] = crypto.createHash('md5').update(signatureParams.join(',')).digest('hex');

        Object.keys(extra).forEach(key => {
            queryParams[key] = extra[key];
        });

        const query = querystring.stringify(flatten(queryParams));

        return `${this.baseUrl}?${query}`;
    }

    getMessagesFromChat(chatId, queryParams, page = 1, limit = 1)
    {
        limit = Math.min(parseInt(limit, 10), 1000);
        page = Math.max(parseInt(page, 10), 1);

        let params = {
            'page': page,
            'limit': limit
        };

        if(_.isFilledPlainObject(queryParams)) {
            const _params = {};
            if(_.isFilledPlainObject(queryParams.extra)) {
                const extraParams = {};

                Object.keys(queryParams.extra).forEach(key => {
                    const value = queryParams.extra[key];

                    if(_.isScalar(value)) {
                        extraParams[key] = _.isBoolean(value, true) ? _.isTRUE(value) : value;
                    }
                });

                if(Object.keys(extraParams).length) {
                    _params.extra = extraParams;
                }
            }

            if(_.isBoolean(queryParams.isDeleted, true)) {
                _params.isDeleted = Number(_.isTRUE(queryParams.isDeleted));
            }

            if(_.isBoolean(queryParams.isEdited, true)) {
                _params.isEdited = Number(_.isTRUE(queryParams.isEdited));
            }

            if(_.isBoolean(queryParams.withUsers, true)) {
                _params.withUsers = Number(_.isTRUE(queryParams.withUsers));
            }

            if(Object.keys(_params).length) {
                params = Object.assign({}, params, _params);
            }
        }

        return this.requestApi(`chat/${chatId}/messages`, params);
    }

    sendMessage(chatId, user, recipients, message, extra = [], buttons = [])
    {
        const queryParams = {
            'user': user,
            'chat_id': chatId,
            'recipients': recipients
        };

        const messageData = {
            'text': message
        };

        if (_.isFilledArray(extra))
        {
            messageData.extra = extra;
        }

        if (_.isFilledArray(buttons))
        {
            messageData.buttons = buttons;
        }

        // recipients.
        // {
        //     $recipientData = [
        //         'id' => $recipient->getId(),
        //         'name' => $recipient->getName(),
        //         'is_bot' => $recipient->getIsBot()
        //     ];

        //     if ($recipient->getAvatar())
        //     {
        //         $recipientData['picture'] = $recipient->getAvatar();
        //     }

        //     $queryParams['recipients'][] = $recipientData;
        // }

        queryParams.messages = [messageData];

        return this.requestApi(`chat/${chatId}/messages`, queryParams, 'post');
    }

    updateMessage(chatId, messageId, {text, isDeleted = false, extra = {}, buttons = []}, {replaceExtra = false, returnMessage = false} = {})
    {
        const params = {message: {}};

        if(_.isString(text) && text.length) {
            params.message.text = text;
        }

        if(_.isTRUE(isDeleted)) {
            params.message.is_deleted = "1";
            delete params.message.text;
        }

        if(_.isFilledPlainObject(extra)) {
            params.message.extra = extra;
        }

        if(_.isFilledArray(buttons)) {
            params.message.buttons = buttons;
        }

        params.update_extra_mode = (replaceExtra === true ? 'replace' : 'merge');

        if(returnMessage === true) {
            params.return_message = '1'
        }

        return this.requestApi(`chat/${chatId}/messages/${messageId}`, params, 'put');
    }

    sendTyping(chatId, userId)
    {
        const queryParams = {
            'user': userId,
            // 'chat': chatId
        };

        return this.requestApi(`chat/${chatId}/typing`, queryParams, 'put');
    }
}

module.exports = Emby;