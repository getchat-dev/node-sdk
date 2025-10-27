# emby-node-sdk
EMBY SDK for Node

## Getting Started
### Installation

```bash
npm install @emby-chat/node-sdk
```
or
```bash
yarn add @emby-chat/node-sdk
```

### Configuration
```javascript
    const Emby = require('@emby-chat/node-sdk');

    const emby = new Emby({
        id: 'your id',
        secret: 'your secret key',
        api_token: 'your api token',
        base_url: 'https://app.getchat.dev/'
    });
```

### Methods

#### deleteChat
```javascript
/**
 * Delete chat
 *
 * @param {string} chatId - The unique identifier for the chat. This parameter is required.
 * 
 * @returns {Promise<Object>} A promise that resolves to the response of the update message action.
 */
```
```javascript
emby.deleteChat(chatId);
```

#### url

```javascript
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
* @param {Object[]} [options.recipients=[]] - An array of recipient objects.
* @param {string} options.recipients[].id - The unique identifier for the recipient.
* @param {string} options.recipients[].name - The name of the recipient.
* @param {boolean} [options.recipients[].is_bot=false] - Indicates if the recipient is a bot.
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
```
```javascript
emby.url({
    chat: {
        id: 'some_unique_string',
        title: 'The name of the chat'
    },
    user: {
        id: 10001,
        name: 'Howard Lovecraft',
        picture: 'https://via.placeholder.com/400',
        rights: {
            kick_users: 'on',
            edit_messages: 'any:extra',
            delete_messages: 'my',
            send_messages: true,
            pin_messages: 'for_everyone',
            send_read_state: true,
        }
    },
    extra: {
        'skin': 'default',
        'skin_options': {
            'display_header': true,
            'hide_day_delimiter': true,
            'message_max_length': 150,
        }
    }
})
```

#### urlByChatId
```javascript
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
 * @param {Object[]} [recipients=[]] - An array of recipient objects.
 * @param {string} recipients[].id - The unique identifier for the recipient.
 * @param {string} recipients[].name - The name of the recipient.
 * @param {boolean} [recipients[].is_bot=false] - Indicates if the recipient is a bot.
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
```

##### available user rights
```javascripton
{
    "$schema": "https://json-schema.org/draft-07/schema",
    "type": "object",
    "properties": {
        "send_messages": {
            "type": "boolean",
            "default": true,
            "description": "Enable or disable sending messages"
        },
        "edit_messages": {
            "type": "string",
            "enum": ["none", "my", "any"],
            "default": "my",
            "description": "Permission to edit messages (none, my, any)"
        },
        "delete_messages": {
            "type": "string",
            "enum": ["none", "my", "any"],
            "default": "my",
            "description": "Permission to delete messages (none, my, any)"
        },
        "pin_messages": {
            "type": "string",
            "enum": ["none", "for_me", "for_everyone"],
            "default": "for_me",
            "description": "Permission to pin messages (none, for_me, for_everyone)"
        },
        "send_photos": {
            "type": "boolean",
            "default": false,
            "description": "Enable or disable sending photos"
        },
        "send_audio": {
            "type": "boolean",
            "default": false,
            "description": "Enable or disable sending audio"
        },
        "send_documents": {
            "type": "boolean",
            "default": false,
            "description": "Enable or disable sending documents"
        },
        "send_location": {
            "type": "boolean",
            "default": false,
            "description": "Enable or disable sending location"
        },
        "create_pools": {
            "type": "boolean",
            "default": false,
            "description": "Enable or disable creating pools"
        },
        "vote_pool": {
            "type": "boolean",
            "default": false,
            "description": "Enable or disable voting in pools"
        },
        "kick_users": {
            "type": "boolean",
            "default": false,
            "description": "Enable or disable kicking users"
        }
    },
    "required": [
        "send_messages",
        "edit_messages",
        "delete_messages",
        "pin_messages",
        "send_photos",
        "send_audio",
        "send_documents",
        "send_location",
        "create_pools",
        "vote_pool",
        "kick_users"
    ]
}
```

So you can specify options for some rights.
For instance edit_messages right can have an additional option "extra" (edit_messages:extra).
It's means that user can edit not only a text, but also an extra options


##### available skin_options
```javascripton
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "display_header": {
            "type": "boolean",
            "default": true,
            "description": "Show or hide header"
        },
        "display_network_pane": {
            "type": "boolean",
            "default": true,
            "description": "Show or hide network pane (only works for default skin)"
        },
        "hide_day_delimiter": {
            "type": "boolean",
            "default": false,
            "description": "Hide date delimiter"
        },
        "hide_deleted_message": {
            "type": "boolean",
            "default": false,
            "description": "If true, deleted messages won't be displayed"
        },
        "message_max_length": {
            "type": "integer",
            "default": 0,
            "description": "Set limit for input message length (0 means no limit)"
        },
        "lang": {
            "type": "string",
            "enum": ["en", "pt", "ru"],
            "default": "en",
            "description": "Set language for skin"
        }
    },
    "required": [
        "display_header",
        "display_network_pane",
        "hide_day_delimiter",
        "hide_deleted_message",
        "message_max_length",
        "lang"
    ]
}
```

generate chat url for unauth user

```javascript
emby.urlByChatId('user10', {session: 'YOUR_SESSION_ID'});
```
generate chat url for unauth user with custom name
```javascript
emby.urlByChatId('user10', {name: 'Custom Name for Guest User', session: 'YOUR_SESSION_ID'});
```
generate chat url for auth user
```javascript
emby.urlByChatId('user10', {id: '10', name: 'User Name'});
```
generate chat url for auth user with avatar
```javascript
emby.urlByChatId('user10', {id: '10', name: 'User Name', avatar: 'source to avatar'});
```
generate chat url for auth user with options
```javascript
emby.urlByChatId('user10', {id: '10', name: 'User Name'}, [], {
    'skin': 'default',
    'skin_options': {
        'hideDeletedMessage' => true
    }
});
```
generate chat url with Portuguese language
```javascript
emby.urlByChatId('user10', {id: '10', name: 'User Name'}, [], {
    'skin': 'default',
    'skin_options': {
        'hideDeletedMessage' => true,
        'lang' => 'pt'
    }
});
```

generate chat url for auth user with right to edit myself messages
```javascript
emby.urlByChatId('chatId10',
    {
        id: '10',
        name: 'User Name',
        rights: {
            edit_messages: 'my:extra'
        }
    }, [], {
        'skin': 'default',
        'skin_options': {
            'hideDeletedMessage' => true
        }
    }
);
```

####  sendMessage
```javascript
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
 * @param {Object[]} [recipients] - An array of recipient objects..
 * @param {string} recipients[].id - The unique identifier for the recipient.
 * @param {string} recipients[].name - The name of the recipient.
 * @param {string} [recipients[].email] - The name of the recipient.
 * @param {string} [recipients[].picture] - The name of the recipient.
 * @param {string} [recipients[].link] - The name of the recipient.
 * @param {boolean} [recipients[].is_bot=false] - Indicates if the recipient is a bot.
 * @param {string} message - The message content to be sent. This parameter is required.
 * @param {Object[]} [extra=[]] - Additional options for the message.
 * @param {Object[]} [buttons=[]] - An array of button objects to be included with the message.
 * @param {string} buttons[].label - The label of the button. This parameter is required.
 * @param {string} buttons[].action - The action associated with the button. This parameter is required.
 * @param {string} buttons[].type - The type of the button (local or remote). This parameter is required.
 * @param {string} [buttons[].style] - The style of the button.
 * 
 * @returns {Promise<Object>} A promise that resolves to the response of the send message action.
 */
```
```javascript
emby
    .sendMessage('chat_id', {
        'id': userId,
        'name': userName
    }, [], message)
    .then(response => {
        console.info('message was successfully sent', response);
    })
    .catch(e => {
        console.error(e.message);
    });
```
####  updateMessage
```javascript
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
```
```javascript
emby.updateMessage(messageId, {
    text: "Change the message text to so-and-so",
    extra: {
        someParameter: 'someValue'
    }
});
```
##### to delete message
```javascript
emby.updateMessage(messageId, {isDeleted: true});
```

#### deleteMessage
```javascript
/**
 * Send a message to a chat.
 *
 * @param {string} chatId - The unique identifier for the chat. This parameter is required.
 * @param {string} messageId - The unique identifier for the message. This parameter is required.
 * 
 * @returns {Promise<Object>} A promise that resolves to the response of the send message action.
 */
```
```javascript
emby
    .deleteMessage(
        chatId,
        messageId
    );
    .then(response => {
        console.info('message was successfully deleted', response);
    })
    .catch(e => {
        console.error(e.message);
    });
```

#### addParticipantsToChat
```javascript
/**
 * Update a message in a chat.
 *
 * @param {string} chatId - The unique identifier for the chat. This parameter is required.
 * @param {Object[]} participants=[] - An array of participant objects. This parameter is required.
 * @param {string} participants[].id - The unique identifier for the recipient. This parameter is required.
 * @param {string} participants[].name - The name of the recipient.
 * @param {string} [participants[].email] - The name of the recipient.
 * @param {string} [participants[].link] - The name of the recipient.
 * @param {string} [participants[].picture] - The name of the recipient.
 * @param {boolean} [participants[].is_bot=false] - Indicates if the recipient is a bot.
 * 
 * @returns {Promise<Object>} A promise that resolves to the response of the update message action.
 */
```
```javascript
emby
    .addParticipantsToChat(
        chatId,
        [
            {
                id: faker.string.alphanumeric(6),
                name: faker.person.fullName(),
            },
            {
                id: faker.string.alphanumeric(6),
                name: faker.person.fullName(),
            },
            {
                id: faker.string.alphanumeric(6),
                name: faker.person.fullName(),
            },
            {
                id: faker.string.alphanumeric(6),
                name: faker.person.fullName(),
            }
        ]
    );
```