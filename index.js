const crypto = require('crypto');
const http = require('https');
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
        params['api_token'] = this.apiToken;

        const query = querystring.stringify(flatten(params));

        // console.info(`${this.baseUrl}/api/${version}/${method}?${query}`.replace(/(\/{2,})/g, '/'));

        return new Promise((resolve, reject) => {
            http.get(`${this.baseUrl}/api/${version}/${method}?${query}`, (res) => {
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
            })
            .on('error', (e) => {
                reject(e);
            });
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
        }

        return this.requestApi(`chat/${chatId}/messages`, params);
    }
}

module.exports = Emby;