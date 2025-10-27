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
    return normalizeData(chat, ['id', 'title', 'socket_port', 'create']);
}

const normalizeParticipant = function(participant) {
    return normalizeData(participant, { id: null, name: null, email: null, link: null, picture: null, is_bot: { default: false } });
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
        this.clientSecret = config.secret;
        this.apiToken = config.api_token;
        this.baseUrl = config.base_url;
        this.apiUrl = config.api_url || this.baseUrl;

        if(_.isString(this.baseUrl)) {
            this.baseUrl = this.baseUrl.replace(/\/$/g, '');
        }
    }

    /**
     * Make a request to the API.
     *
     * @param {string} method - The API method to be called. This parameter is required.
     * @param {Object} [params={}] - The parameters to be passed to the API method.
     * @param {string} [type='get'] - The HTTP request type (e.g., 'get', 'post'). Defaults to 'get'.
     * @param {string} [version='v1'] - The API version to use. Defaults to 'v1'.
     * @returns {Promise<Object>} A promise that resolves to the API response.
     */
    requestApi(method, params = {}, type = 'get', version = 'v1')
    {
        let sParams = '';

        let _url = `${this.apiUrl}/api/${version}/${method}`;

        if(!(type === 'post' || type === 'put')) {
            _url+= '?'+querystring.stringify(flatten(params))
        }

        _url = encodeURI(_url);

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
        }

        return new Promise((resolve, reject) => {
            const request = (urlParts.protocol === 'https:' ? https : http).request(options, (res) => {

                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    const contentType = res.headers['content-type'];

                    if (contentType === 'application/json') {
                        try {
                            body = JSON.parse(body);
                        } catch (e) {
                            reject(e);
                        }
                    }

                    if (res.statusCode >= 200 && res.statusCode < 400) {
                        resolve(body);
                    }
                    else {
                        const e = new Error(body);
                        e.status = res.statusCode;
                        reject(e);
                    }
                });
            })
            .on('error', (e) => {
                reject(e);
            });

            if(sParams.length) {
                request.write(sParams);
            }

            request.end();
        });
    }

    /**
     * Generate a chat URL.
     *
     * @param {Object} options - The options object containing all parameters.
     * @param {Object} [options.chat] - The chat object containing chat details. This parameter is required.
     * @param {string} [options.chat.id] - The unique identifier for the chat. This parameter is required.
     * @param {string} [options.chat.title] - The title of the chat.
     * @param {Object} options.user - The user object containing user details. This parameter is required.
     * @param {string} options.user.id - The unique identifier for the user.
     * @param {string} [options.user.name] - The name of the user.
     * @param {string} [options.user.email] - The email of the user.
     * @param {string} [options.user.picture] - The picture URL of the user.
     * @param {string} [options.user.link] - The link associated with the user.
     * @param {Object} [options.user.rights] - The rights object containing user permissions.
     * @param {boolean} [options.user.rights.send_messages=true] - Enable or disable sending messages.
     * @param {("none"|"my"|"any")} [options.user.rights.edit_messages="my"] - Permission to edit messages.
     * @param {("none"|"my"|"any")} [options.user.rights.delete_messages="my"] - Permission to delete messages.
     * @param {("none"|"for_me"|"for_everyone")} [options.user.rights.pin_messages="for_me"] - Permission to pin messages.
     * @param {boolean} [options.user.rights.send_photos=false] - Enable or disable sending photos.
     * @param {boolean} [options.user.rights.send_audio=false] - Enable or disable sending audio.
     * @param {boolean} [options.user.rights.send_documents=false] - Enable or disable sending documents.
     * @param {boolean} [options.user.rights.send_location=false] - Enable or disable sending location.
     * @param {boolean} [options.user.rights.create_pools=false] - Enable or disable creating pools.
     * @param {boolean} [options.user.rights.vote_pool=false] - Enable or disable voting in pools.
     * @param {boolean} [options.user.rights.kick_users=false] - Enable or disable kicking users.
     * @param {Object[]} [options.participants=[]] - An array of recipient objects.
     * @param {string} options.participants[].id - The unique identifier for the recipient.
     * @param {string} options.participants[].name - The name of the recipient.
     * @param {boolean} [options.participants[].is_bot=false] - Indicates if the recipient is a bot.
     * @param {Object} [options.extra={}] - Additional options.
     * @param {Object} [options.extra.skin_options] - Skin options for the chat interface.
     * @param {boolean} [options.extra.skin_options.display_header=true] - Show or hide header.
     * @param {boolean} [options.extra.skin_options.display_network_pane=true] - Show or hide network pane (only works for default skin).
     * @param {boolean} [options.extra.skin_options.hide_day_delimiter=false] - Hide date delimiter.
     * @param {boolean} [options.extra.skin_options.hide_deleted_message=false] - If true, deleted messages won't be displayed.
     * @param {number} [options.extra.skin_options.message_max_length=0] - Set limit for input message length (0 means no limit).
     * @param {("en"|"pt"|"ru")} [options.extra.skin_options.lang="en"] - Set language for skin.
     * 
     * @returns {string} The generated chat URL.
     */
    url({chat = null, user = {}, participants = [], extra = {} })
    {
        // check chat parameter
        if(_.isPlainObject(chat)) {
            chat = normalizeChat(chat);
        }
        else if(_.isString(chat)) {
            chat = {id: chat};
        }
        else {
            chat = null;
        }

        // check user parameter
        if(_.isPlainObject(user)) {
            user = normalizeData(user, {
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
            throw new Error('user parameter have to be a plain object');
        }

        const rnd = strRandom(32);

        let signatureParams = [
            this.clientSecret,
            rnd
        ];

        const queryParams = {
            'rnd': rnd,
            'user': user,
            'recipients': []
        };

        signatureParams = addToSignature(signatureParams, user, ['id', 'name', 'email', 'link', 'picture']);
 
        participants.forEach(participant => {
            participant = normalizeData(participant, {id: null, name: null, is_bot: {default: false}});

            queryParams['recipients'].push(participant)
            signatureParams = addToSignature(signatureParams, participant, ['id', 'name']);
        });

        if (chat) {
            signatureParams = addToSignature(signatureParams, chat, ['id', 'title', 'socket_port', 'create'])
            queryParams['chat'] = chat;
        }

        queryParams['signature'] = crypto.createHash('md5').update(signatureParams.join(',')).digest('hex');

        Object.keys(extra).forEach(key => {
            queryParams[key] = extra[key];
        });

        const query = querystring.stringify(flatten(queryParams));

        return `${this.baseUrl}?${query}`;
    }

    /**
     * Generate a chat URL by chat ID.
     *
     * @param {Object} chat - The chat object containing chat details. This parameter is required.
     * @param {string} chat.id - The unique identifier for the chat. This parameter is required.
     * @param {string} chat.title - The title of the chat.
     * @param {Object} user - The user object containing user details. This parameter is required.
     * @param {string} user.id - The unique identifier for the user.
     * @param {string} user.name - The name of the user.
     * @param {string} [user.email] - The email of the user.
     * @param {string} [user.picture] - The picture URL of the user.
     * @param {string} [user.link] - The link associated with the user.
     * @param {Object} [user.rights] - The rights object containing user permissions.
     * @param {boolean} [user.rights.send_messages=true] - Enable or disable sending messages.
     * @param {("none"|"my"|"any")} [user.rights.edit_messages="my"] - Permission to edit messages.
     * @param {("none"|"my"|"any")} [user.rights.delete_messages="my"] - Permission to delete messages.
     * @param {("none"|"for_me"|"for_everyone")} [user.rights.pin_messages="for_me"] - Permission to pin messages.
     * @param {boolean} [user.rights.send_photos=false] - Enable or disable sending photos.
     * @param {boolean} [user.rights.send_audio=false] - Enable or disable sending audio.
     * @param {boolean} [user.rights.send_documents=false] - Enable or disable sending documents.
     * @param {boolean} [user.rights.send_location=false] - Enable or disable sending location.
     * @param {boolean} [user.rights.create_pools=false] - Enable or disable creating pools.
     * @param {boolean} [user.rights.vote_pool=false] - Enable or disable voting in pools.
     * @param {boolean} [user.rights.kick_users=false] - Enable or disable kicking users.
     * @param {Object[]} [participants=[]] - An array of recipient objects.
     * @param {string} participants[].id - The unique identifier for the recipient.
     * @param {string} participants[].name - The name of the recipient.
     * @param {boolean} [participants[].is_bot=false] - Indicates if the recipient is a bot.
     * @param {Object} [extra={}] - Additional options.
     * @param {Object} [extra.skin_options] - Skin options for the chat interface.
     * @param {boolean} [extra.skin_options.display_header=true] - Show or hide header.
     * @param {boolean} [extra.skin_options.display_network_pane=true] - Show or hide network pane (only works for default skin).
     * @param {boolean} [extra.skin_options.hide_day_delimiter=false] - Hide date delimiter.
     * @param {boolean} [extra.skin_options.hide_deleted_message=false] - If true, deleted messages won't be displayed.
     * @param {number} [extra.skin_options.message_max_length=0] - Set limit for input message length (0 means no limit).
     * @param {("en"|"pt"|"ru")} [extra.skin_options.lang="en"] - Set language for skin.
     * 
     * @returns {string} The generated chat URL.
     */
    urlByChatId(chat = {}, user = {}, participants = [], extra = {})
    {
        // check chat parameter
        if(_.isPlainObject(chat)) {
            chat = normalizeChat(chat);
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
            user = normalizeData(user, {
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
            this.clientSecret,
            rnd
        ];

        const queryParams = {
            'rnd': rnd,
            'chat': chat,
            'user': user,
            'recipients': []
        };

        signatureParams = addToSignature(signatureParams, user, ['id', 'name', 'email', 'link', 'picture']);
 
        participants.forEach(participant => {
            participant = normalizeData(participant, {id: null, name: null, is_bot: {default: false}});

            queryParams['recipients'].push(participant)
            signatureParams = addToSignature(signatureParams, participant, ['id', 'name']);
        });

        signatureParams = addToSignature(signatureParams, chat, ['id', 'title', 'socket_port', 'create'])

        queryParams['signature'] = crypto.createHash('md5').update(signatureParams.join(',')).digest('hex');

        Object.keys(extra).forEach(key => {
            queryParams[key] = extra[key];
        });

        const query = querystring.stringify(flatten(queryParams));

        return `${this.baseUrl}?${query}`;
    }

    /**
     * Retrieve chat details by chat ID.
     *
     * @param {string} chatId - The unique identifier for the chat. This parameter is required.
     * 
     * @returns {Object[]} An Chat object.
     */
    getChatInfo(id)
    {
        if(!_.isString(id)) {
            throw new Error(`chat id isn't passed`);
        }

        return this.requestApi(`chats/${id}`);
    }

    /**
     * Retrieve messages from a chat by chat ID.
     *
     * @param {string} chatId - The unique identifier for the chat. This parameter is required.
     * @param {Object} queryParams - The query parameters to filter messages. This parameter is required.
     * @param {number} [page=1] - The page number for pagination. Defaults to 1.
     * @param {number} [limit=1] - The number of messages to retrieve per page. Defaults to 1.
     * 
     * @returns {Object[]} An array of messages from the chat.
     */
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

        return this.requestApi(`chats/${chatId}/messages`, params);
    }

    /**
     * Send a message to a chat.
     *
     * @param {string} chatId - The unique identifier for the chat. This parameter is required.
     * @param {Object} user - The user object sending the message. This parameter is required.
     * @param {string} user.id - The unique identifier for the user.
     * @param {string} [user.name] - The name of the user.
     * @param {string} [user.email] - The email of the user.
     * @param {string} [user.picture] - The picture URL of the user.
     * @param {string} [user.link] - The link associated with the user.
     * @param {Object[]} [participants] - An array of recipient objects. Backend takes into participants only for the new chat, otherwise it will be ignored.
     * @param {string} participants[].id - The unique identifier for the recipient.
     * @param {string} participants[].name - The name of the recipient.
     * @param {string} [participants[].email] - The name of the recipient.
     * @param {string} [participants[].picture] - The name of the recipient.
     * @param {string} [participants[].link] - The name of the recipient.
     * @param {boolean} [participants[].is_bot=false] - Indicates if the recipient is a bot.
     * @param {string} message - The message content to be sent. This parameter is required.
     * @param {Object} [extra] - Additional options for the message.
     * @param {Object[]} [buttons=[]] - An array of button objects to be included with the message.
     * @param {string} buttons[].label - The label of the button. This parameter is required.
     * @param {string} buttons[].action - The action associated with the button. This parameter is required.
     * @param {string} buttons[].type - The type of the button (local or remote). This parameter is required.
     * @param {string} [buttons[].style] - The style of the button.
     * 
     * @returns {Promise<Object>} A promise that resolves to the response of the send message action.
     */
    sendMessage(chat, user, participants, message, extra = {}, buttons = [])
    {
        const queryParams = {
            'user': user,
            'participants': participants
        };

        const messageData = {
            'text': message
        };

        // check chat parameter
        if(_.isPlainObject(chat)) {
            chat = normalizeChat(chat);
        }
        else if(_.isString(chat)) {
            chat = {id: chat};
        }
        else {
            throw new Error('first parameter(chat) have to be a plain object or string');
        }

        if(!_.isString(chat.id)) {
            if(! _.isNumeric(chat.id)) {
                throw new Error(`chat id isn't passed`);
            }

            chat.id = chat.id.toString();
        }

        const chatId = chat.id;
        delete chat.id;
        if (Object.keys(chat).length) {
            queryParams.chat = chat;
        }

        if (_.isFilledPlainObject(extra))
        {
            messageData.extra = extra;
        }

        if (_.isFilledArray(buttons))
        {
            messageData.buttons = buttons;
        }

        if (_.isFilledArray(participants)) {
            const _participants = participants.map(normalizeParticipant);
            if (_.isFilledArray(_participants)) {
                queryParams.participants = _participants;
            }
        }

        queryParams.messages = [messageData];

        return this.requestApi(`chats/${chatId}/messages`, queryParams, 'post');
    }

    /**
     * Update a message in a chat.
     *
     * @param {string} chatId - The unique identifier for the chat. This parameter is required.
     * @param {string} messageId - The unique identifier for the message. This parameter is required.
     * @param {Object} updateData - The data to update the message with. This parameter is required.
     * @param {string} updateData.text - The new text content of the message.
     * @param {boolean} [updateData.isDeleted=false] - Flag indicating if the message is deleted.
     * @param {Object} [updateData.extra={}] - Additional options for the message.
     * @param {Object[]} [updateData.buttons=[]] - An array of button objects to be included with the message.
     * @param {string} updateData.buttons[].label - The label of the button. This parameter is required.
     * @param {string} updateData.buttons[].action - The action associated with the button. This parameter is required.
     * @param {string} [updateData.buttons[].type] - The type of the button (local or remote).
     * @param {string} [updateData.buttons[].style] - The style of the button.
     * @param {Object} [options={}] - Additional options for the update operation.
     * @param {boolean} [options.replaceExtra=false] - Flag to replace the existing extra options with the new ones.
     * @param {boolean} [options.returnMessage=false] - Flag to return the updated message.
     * 
     * @returns {Promise<Object>} A promise that resolves to the response of the update message action.
     */
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

        return this.requestApi(`chats/${chatId}/messages/${messageId}`, params, 'put');
    }

    /**
     * Update a message in a chat.
     *
     * @param {string} chatId - The unique identifier for the chat. This parameter is required.
     * @param {string} messageId - The unique identifier for the message. This parameter is required.
     * 
     * @returns {Promise<Object>} A promise that resolves to the response of the update message action.
     */
    deleteMessage(chatId, messageId)
    {
        const params = { message: {} };
        params.message.is_deleted = "1";

        return this.requestApi(`chats/${chatId}/messages/${messageId}`, params, 'put');
    }

    /**
     * Send a typing indicator to a chat.
     *
     * @param {string} chatId - The unique identifier for the chat. This parameter is required.
     * @param {string} userId - The unique identifier for the user. This parameter is required.
     * 
     * @returns {Promise<void>} A promise that resolves when the typing indicator has been sent.
     */
    sendTyping(chatId, userId)
    {
        const queryParams = {
            'user': userId,
        };

        return this.requestApi(`chats/${chatId}/typing`, queryParams, 'put');
    }

    /**
     * Add a participants to a chat.
     *
     * @param {string} chatId - The unique identifier for the chat. This parameter is required.
     * @param {Object[]} participants=[] - An array of participant objects. This parameter is required.
     * @param {string} participants[].id - The unique identifier for the recipient. This parameter is required.
     * @param {string} participants[].name - The name of the recipient.
     * @param {string} [participants[].email] - The name of the recipient.
     * @param {string} [participants[].picture] - The name of the recipient.
     * @param {string} [participants[].link] - The name of the recipient.
     * @param {boolean} [participants[].is_bot=false] - Indicates if the recipient is a bot.
     * 
     * @returns {Promise<Object>} A promise that resolves to the response of the send message action.
     */
    addParticipantsToChat(chatId, participants = [])
    {
        if(! _.isFilledArray(participants)) {
            throw new Error('participants have to be an array of participant objects');
        }

        const queryParams = {
            participants: participants.map(normalizeParticipant)
        };

        return this.requestApi(`chats/${chatId}/participants`, queryParams, 'post');
    }
}

module.exports = Emby;