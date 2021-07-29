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

class Emby {

    constructor(config = {}) {
        this.clientId = config.id;
        this.clientSecret = config.secret;
        this.apiToken = config.api_token;
        this.baseUrl = config.base_url;
    }

    requestApi(method, params = {}, type = 'get', version = 'v1')
    {
        let sParams = '';

        let _url = `${this.baseUrl}/api/${version}/${method}?api_token=${this.apiToken}`;

        if(!(type === 'post' || type === 'put')) {
            _url+= querystring.stringify(flatten(params))
        }

        const urlParts = url.parse(_url);

        const options = {
            method: type.toUpperCase(),
            ...(_.onlyProps(urlParts, ['hostname', 'port', 'path'])),
            headers: {
                'Content-Type': 'application/json',
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
                console.info(sParams);
                request.write(sParams);
            }

            request.end();
        })
    }

    /**
     * @param chatId
     * @param Array user
     * @param Array[] recipients
     * @param Array extra
     * @return string
     */
     urlByChatId(chatId, user = {}, recipients = [], extra = {})
     {
        const rnd = strRandom(32);

        const signatureParams = [
            this.clientId,
            this.clientSecret,
            rnd
        ];

        const queryParams = {
            'client_id': this.clientId,
            'chat_id': chatId,
            'rnd': rnd,
            'user': [],
            'recipients': []
        };
 
        if(user) {
            if(user.email) {
                signatureParams.push(queryParams['user']['email'] = user.email);
            }

            if(user.id) {
                signatureParams.push(queryParams['user']['id'] = user.id);
            }

            if(user.name) {
                signatureParams.push(queryParams['user']['name'] = user.name);
            }

            if(user.avatar)
            {
                signatureParams.push(queryParams['user']['picture'] = user.avatar);
            }

            if(!user.id) {
                if(user.session) {
                    queryParams['user']['session'] = user.session;
                }
                else {
                    queryParams['user']['session'] = strRandom(40);
                }
            }

            if(Object.keys(user.rights).length) {
                const userRights = processUserRights(user.rights);
                if(userRights && Object.keys(userRights).length) {
                    queryParams['user']['rights'] = userRights;
                }
            }
        }
 
        recipients.forEach(recipient => {
            signatureParams.push(recipient['id']);
            signatureParams.push(recipient['name']);

            const recipientData = {
                'id': recipient['id'],
                'name': recipient['name'],
                'is_bot': recipient['is_bot'] || false
            };

            if(recipient.avatar) {
                recipientData['picture'] = recipient.avatar;
            }

            queryParams['recipients'].push(recipientData);
        });

        signatureParams.push(chatId);
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

        return this.requestApi('messages', queryParams, 'post');
    }

    updateMessage(messageId, {text, isDeleted = false, extra = {}, buttons = []}, {replaceExtra = false} = {})
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

        return this.requestApi(`messages/${messageId}`, params, 'put');
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