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

## Methods

### urlByChatId
generate chat url by chat id
parameters
1. required (string) chat_id
2. (object) user
3. (array[object]) recipients
4. (object) extra - options

generate chat url for unauth user

    emby.urlByChatId('user10');

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