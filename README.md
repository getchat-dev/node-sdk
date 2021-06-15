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

## available user rights

1. send_messages=true (boolean)
2. edit_messages=my (enum: none|my|any)
3. delete_messages=my (enum: none|my|any)
4. pin_messages=for_me (enum: none|for_me|for_everyone)
5. send_photos=false (boolean)
6. send_audio=false (boolean)
7. send_documents=false (boolean)
8. send_location=false (boolean)
9. create_pools=false (boolean)
10. vote_pool=false (boolean)
11. kick_users=false (boolean)

## available skin_options

- display_header=true (boolean) // show or hide header
- display_network_pane=true (boolean) // show or hide network pane now it works only for default skin
- hide_day_delimiter=false (boolean) // hide date delimiter
- hide_deleted_message=false (boolean) // if true deleted message won't be displayed
- message_max_length=0 (integer) // set limit letters for input message if set to 0 no limits
- lang (enum: en,pt,ru) // set language for skin

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