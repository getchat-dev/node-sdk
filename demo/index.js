const express = require('express')
const Emby = require('../index.js');
const path = require('path');

const emby = new Emby({
    id: process.env.EMBY_ID,
    secret: process.env.EMBY_SECRET,
    api_token: process.env.EMBY_API_TOKEN,
    base_url: process.env.EMBY_BASE_URL
  });

const app = express();

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '/views'));

app.use('/chat-with-guest', function (request, response) {

    chatUrl1 = emby.urlByChatId(
        'https://markuper.com',
        {
            id: 10000,
            name: 'Steven King',
            session: 'ololo',
            rights: {
                kick_users: 'on',
                delete_messages: 'any',
                send_messages: true
            }
        },
        [],
        {
            'skin': 'default',
            'skin_options': {
                'displayHeader': false,
                'lang': 'pt'
            }
        }
    );

    chatUrl2 = emby.urlByChatId(
        'https://markuper.com',
        {
            id: 10001,
            name: 'Howard Lovecraft',
            rights: {
                kick_users: 'on',
                delete_messages: 'my',
                send_messages: true
            }
        },
        [],
        {
            'skin': 'ebac_webinar',
            'skin_options': {
                'displayHeader': false,
                'lang': 'ru'
            }
        }
    );

    response.render('chat-with-guest', {
        title: 'Emby Chat with guest user',
        chatUrl1: chatUrl1,
        chatUrl2: chatUrl2
    });
});

app.listen(9009);