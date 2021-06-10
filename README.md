# emby-node-sdk
EMBY SDK for Node

## Installation

    npm install @emby-chat/node-sdk
or

    yarn add @emby-chat/node-sdk

## Init

    const Emby = require('@emby-chat/node-sdk');

    const emby = new Emby({
        id: 'your id',
        secret: 'your secret key',
        api_token: 'your api token',
        base_url: 'https://emby-chat.io/'
    });

## all user rights

1. send_messages (boolean)
2. edit_messages (enum: none|my|any)
3. delete_messages (enum: none|my|any)
4. send_photos (boolean)
5. send_audio (boolean)
6. send_documents (boolean)
7. send_location (boolean)
8. create_pools (boolean)
9. vote_pool (boolean)
10. kick_users (boolean)

## Methods

### urlByChatId
generate chat url by chat id
parameters
1. required (string) chat_id
2. (object) user
3. (array[object]) recipients
4. (object) extra - options

generate chat url for unauth user

    emby.urlByChatId('user10', {session: 'YOUR_SESSION_ID'});

generate chat url for unauth user with custom name

    emby.urlByChatId('user10', {name: 'Custom Name for Guest User', session: 'YOUR_SESSION_ID'});

generate chat url for auth user

    emby.urlByChatId('user10', {id: '10', name: 'User Name'});

generate chat url for auth user with avatar

    emby.urlByChatId('user10', {id: '10', name: 'User Name', avatar: 'source to avatar'});

generate chat url for auth user with options

    emby.urlByChatId('user10', {id: '10', name: 'User Name'}, [], {
        'skin': 'default',
        'skin_options': {
            'hideDeletedMessage' => true
        }
    });

generate chat url with Portuguese language

    emby.urlByChatId('user10', {id: '10', name: 'User Name'}, [], {
        'skin': 'default',
        'skin_options': {
            'hideDeletedMessage' => true,
            'lang' => 'pt'
        }
    });