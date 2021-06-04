const crypto = require('crypto');
const querystring = require('querystring');
const processUserRights = require('./libs/processUserRights');

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

            if(user.session) {
                queryParams['user']['session'] = user.session;
            }
            else {
                queryParams['user']['session'] = strRandom(40);
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
}

module.exports = Emby;