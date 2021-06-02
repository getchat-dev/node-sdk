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
console.info(__dirname);
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '/views'));

app.use('/chat-with-guest', function (request, response) {

    response.render('chat-with-guest', {
        title: 'Emby Chat with guest user',
        chatUrl: emby.urlByChatId(
            'hsabasdjdlsw',
            {
                name: 'Steven King'
            },
            [],
            {
                'skin': 'ebac_webinar',
                'skin_options': {
                    'displayHeader': false
                }
            }
        )
    });
});

app.listen(9009);