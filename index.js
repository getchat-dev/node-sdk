const crypto = require('crypto');

const strRandom = function(len = 10) {

    let text = '';

    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for(let i = 0; i < len; i++)
    {
        text+= charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return text;
}

const urlQueryBuild = (scope = '', params) => {
    const scopePrefix = (key, value) => {
        return scope ? `${scope}[${key}]=${value}` : `${key ? `${key}=` : ''}${value}`;
    };

    const query =
        Object.keys(params)
            .map(key => {
                if(params[key] && typeof(params[key]) === 'object') {
                    return scopePrefix('', urlQueryBuild(key, params[key]));
                }
                else {
                    return scopePrefix(key, params[key]);
                }
            })
            .join('&');

    return query;
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

        const query = urlQueryBuild('', queryParams);

        return `${this.baseUrl}?${query}`;
    }
}

module.exports = Emby;