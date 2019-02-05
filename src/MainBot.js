require('dotenv').config();
const https = require('https');
const assert = require('assert');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const path = require('path');
const prettyBytes = require('pretty-bytes');

const helpmsgPrivate = '<b>Hi there!</b>\nI can help you with file conversions!\n\
<b>tl;dr</b>: Just send me your file to convert.\n\n\
I support 218 different file formats and I know how to handle media of any kind (<i>audio \
files, documents, photos, stickers, videos, voice notes and video notes</i>). It usually \
takes just a few seconds or maybe some minutes to perform a conversion. Just send me the \
file and I will respond with a list of all possible conversions. I am confident that \
your format will be among them!\n\n\
<b>I will do all of this for free.</b> However, I cannot provide an unlimited number of \
conversions every day without anyone being charged for that.\nIf you just need to convert that one \
file, you do not need to worry about this, that should work right out of the box. If you \
need to convert A LOT OF files, please consider <i>setting up an account</i> \
(see /the_more_the_merrier). It is very important, otherwise this bot would not work. Also, send \
/limitations to find out about the limitations this bot has.\n\n\
You can add this bot to a group chat, too! I support automatic file conversions! However, you \
should definitely set up an account before you do <i>that</i>, that\'d be great!';

const helpmsgStartGroups = '<b>Hi there!</b>\nMy name is Cloud Convert Bot and I can help \
you with file conversions! Type /help for a quick intro. Don\'t forget to set up your account: \
/the_more_the_merrier';

const helpmsgGroups = '<b>Hi there!</b>\nMy name is Cloud Convert Bot and I can help \
you with file conversions!\nI will not spam you with any messages or any converted \
files (unless you ask nicely). There is two ways to tell me that I should convert a \
file for you:\n  1) <i>Reply</i> to a file someone sends. Reply with the target format \
directly (e. g. /mp4) or send /convert to see possible formats. I will use the most \
recent file if you do not hit reply for any message.\n  2) <i>Send a caption</i> when \
you send the file, e. g. /mp4 to convert to MP4.\n\nOnce the conversion is completed, \
you can enable <b>auto-conversions</b>. If you enable auto-conversions for a file type, \
I will automatically repeat this conversion for all files of the same type.\n\n\
<b>The most awesome feature</b> is that you can set up your own account. This bot can \
work for some time without an account, but if you use the bot regularly, setting up an \
account <i>is really important</i> because you can get waaay more free conversions like \
that. Set it up with /the_more_the_merrier. This way, you can avoid some /limitations.';

const helpmsgLimitations = 'Currently there is <b>two limitations</b>. First: you can only convert \
a few files a day. Second: you can only convert files up a certain size.\n\nBecause all users \
of this bot share a common pool of 25 conversions per day (check the balance with /balance), you \
cannot convert more than 25 files per day. <b>The good thing</b> is: you simply need to set up \
an account and BOOM this limit is gone! See /the_more_the_merrier for that!\n\nTelegram does not \
allow bots (like me) to download files with more than 20 MB in size or upload files with more \
than 50 MB in size. This limit cannot be changed. If you need to convert larger files, you could \
visit cloudconvert.com. Sorry!';

const helpmsgSetUpAccount = 'All users of this bot share a common pool of 25 conversions per day. \
You can check the balance with /balance.\n\n\
Why restrict yourself? You can <b>claim your own extra 25 free conversions per day</b>! \
No one else will be able to impact this counter. You will not have to pay anything for this \
and it works entirely without witchcraft. All you need to do is to follow these three steps:\n\
<b>1)</b> Create your own Cloud Convert account <a href="https://cloudconvert.com/register">here</a>.\n\
<b>2)</b> Visit the <a href="https://cloudconvert.com/dashboard/api">dashboard</a> and copy the API key.\n\
<b>3)</b> Get back to this chat and send /apikey. Paste the API key into this chat.\n\
Now every single operation of this bot will work based on your new Cloud Convert account! \
Resetting the bot with /start clears the API key from the database. This will return you to \
the account shared among all bot users.\n\nBy providing an API key, you help contributing to the \
bot by taking load off the shared account. That\'s why you will receive an extra gift (like \
getting more free conversions wasn\'t enough!). Once you provided your API key, I will tell \
you the name of a secret bot command to find out even more about the files you send me.\n\n\
Please note that this bot or its dev is in no way associated with cloudconvert.com. They just \
offer free file conversions and they have a neat way to connect bots to that service. They\'re \
based in Munich and you do not need to worry about privacy concerns or ads or "we miss you" \
bullshit. Remeber that connecting your own account to this bot is very important for this bot \
to function.';

const helpmsgBalanceWithApiKey = 'Yay! You have connected your personal Cloud Convert account with \
this bot! Thank you! You can check its balance with /balance.\n\n\
You connected this bot by providing the following API key (thanks!):';

const validatingApiKey = 'Validating ...';

const cannotSetApiKey = 'This API key does not seem to be valid! Did you follow the steps under \
/the_more_the_merrier?';

const helpmsgBuyMinutes = 'If you need to perform even more conversions, you can buy conversion minutes \
at www.cloudconvert.com. This bot will automatically use them if available. However, please remember \
that this project was created by a single student at Kiel University. Even though I did my best \
to keep this piece of software free of errors and as reliable as possible, I cannot guarantee that \
this bot is <i>not accidentally consuming all of your conversion minutes</i>, killing your kitten or \
the like. It has never happened so far and I consider it highly unlikely, but it is still software, \
so you never know. If you know JavaScript, you can check out the \
<a href="https://github.com/KnorpelSenf/cloudconvert-bot">source code</a> \
to verify that something as bad as this won\'t ever happen.';

const helpmsgAddedToGroup = '<b>Hi!</b>\nHit /help for a quick intro. Contact @KnorpelSenf for \
questions. And don\'t forget to set up an account! /the_more_the_merrier';

const autoConversionSaved = 'Saved.';

const remainingConversions = 'Remaining conversions';

const customApiKeyInstruction = 'Need to perform more conversions? /the_more_the_merrier';

const helpmsgFeedback = 'Like this bot? Hit this link and rate it!\n\
https://telegram.me/storebot?start=cloud_convert_bot';

const sendApiKey = 'Perfect! Now send me the API key!';

const helpmsgInfo = 'Use this command in reply to a file! \
I will then tell you all file information (meta data) I know.';

const helpmsgConvert = 'Use this command in reply to a file! \
I will then list all possible conversions for that.';

const helpmsgFile = 'Alright, now send me a file to be converted to ';

const cancelOperation = 'Cancel operation';

const operationCancelled = 'Operation cancelled.';

const helpmsgText = 'Send me a file to convert it!';

const apiKeyProvided = 'Thank you for providing the API key! Your own account is now ready \
and set up. By no longer relying on the default account, you help making the bot more useful \
for everyone out there!\n\nI promised to unveil a hidden bot command, and I like to keep \
promises! Here we go: whenever you provided a file, send /info to get detailed information \
about your files. Beware, a lot of things are pretty technical there, but there\'s also a \
bunch of cool facts you probably didn\'t know. How awesome is that?! Check it out!';

const unsupportedConversion = 'This conversion is not supported!';
const conversionError = 'The conversion could not be performed. See the details below.';
const unknownError = 'Something went wrong. Sorry for that. You may contact \
@KnorpelSenf because of this.';

const invalidApiKey = 'Your API key is invalid! Use /apikey to set a new key. Restarting \
the bot with /start clears the API key and returns you to using the account shared among \
all bot users.\n\nThis is the invalid API key you provided:\n';

const noMoreConversionMinutes = 'It looks like there is no free conversions remaining! \
Check /balance!\n\nYou will automatically be provided with 25 more free conversions \
within the next 24 hours.';

// Prevent zeit.co from restarting the bot
https.createServer().listen(3000);

const CloudConvert = require('cloudconvert');
const cloudconvert = new CloudConvert(process.env.CLOUD_CONVERT_API_TOKEN);

const botApiToken = process.env.BOT_API_TOKEN;
const Slimbot = require('slimbot');
const slimbot = new Slimbot(botApiToken);

var botId;
var botName;
var isDevBot;

// Connection URL
const url = 'mongodb://bot:' + process.env.MONGO_DB_PASSWORD + '@ds255403.mlab.com:55403/cloudconvert-bot';

// Database Name
const dbName = 'cloudconvert-bot';
var db;

// Create a new MongoClient
const client = new MongoClient(url, { useNewUrlParser: true });

// Use connect method to connect to the Server
client.connect(err => {
    assert.equal(null, err);
    console.log('Connected successfully to database server');

    db = client.db(dbName);

    db.collection('tasks').countDocuments().then(c => console.log('Number of used chats: ' + c));

    slimbot.getMe().then(response => {
        let result = response.result;
        botId = result.id;
        botName = result.username;
        isDevBot = botName.indexOf('dev') >= 0;
        // wait for messages
        console.log('Start polling at ' + new Date());
        slimbot.startPolling();
    });

    // client.close();
});

// Register listeners
slimbot.on('message', message => {
    let chat = message.chat;
    let chatId = chat.id;
    let chatType = chat.type;
    let messageId = message.message_id;

    if (message.hasOwnProperty('new_chat_members')) {

        let botWasAdded = message.new_chat_members.some(user => user.id === botId);
        if (botWasAdded) {
            registerChat(chatId);
            slimbot.sendMessage(chatId, helpmsgAddedToGroup, { parse_mode: 'html' });
        }

    } else if (message.hasOwnProperty('left_chat_member')) {

        let botWasRemoved = message.left_chat_member.id === botId;
        if (botWasRemoved) {
            unregisterChat(chatId);
        }

    } else if (message.hasOwnProperty('text')) {

        let text = message.text;
        let options = { original: text };
        let lowerText = text.toLowerCase();

        if (message.hasOwnProperty('reply_to_message')) {
            let reply = message.reply_to_message;
            if (reply.text === sendApiKey) {
                saveApiKey(chatId, text);
                return;
            } else {
                let file;
                if (reply.hasOwnProperty('photo')) {
                    file = reply.photo[reply.photo.length - 1];
                } else {
                    file = ['audio',
                        'document',
                        'sticker',
                        'video',
                        'voice',
                        'video_note']
                        .map(p => reply[p])
                        .find(p => p !== undefined);
                }

                if (file) {
                    let fileId = file.file_id;
                    if (fileId) {
                        options.file_id = fileId;
                    }
                }
            }
        }

        if (message.hasOwnProperty('entities')
            && message.entities[0].type === 'bot_command'
            && message.entities[0].offset === 0
            && (lowerText.indexOf('@') < 0 || lowerText.endsWith(botName))) {
            handleCommand(chatId, chatType, messageId, lowerText, options);
        } else {
            handleText(chatId, chatType, messageId, text, options);
        }

    } else {
        let file;
        if (message.hasOwnProperty('photo')) {
            let photoSizes = message.photo;
            file = photoSizes[photoSizes.length - 1];
        } else {
            file = ['audio',
                'document',
                'sticker',
                'video',
                'voice',
                'video_note']
                .map(p => message[p])
                .find(p => p !== undefined);
        }
        if (file) {
            let fileId = file.file_id;
            if (fileId) {
                let command;
                if (message.hasOwnProperty('reply_to_message')) {
                    let reply = message.reply_to_message;
                    if (reply.hasOwnProperty('text')
                        && reply.hasOwnProperty('entities')
                        && reply.entities[0].type === 'bot_command'
                        && message.entities[0].offset === 0
                        && (text.indexOf('@') < 0 || text.endsWith(botName))) {
                        command = reply.text;
                    }
                } else if (message.hasOwnProperty('caption')) {
                    let caption = message.caption;
                    if (message.hasOwnProperty('caption_entities')
                        && message.caption_entities[0].type === 'bot_command'
                        && message.caption_entities[0].offset === 0
                        && (caption.indexOf('@') < 0 || caption.endsWith(botName))) {
                        command = caption;
                    }
                }
                if (command) {
                    command = command.toLowerCase();
                    let atIndex = command.indexOf('@');
                    if (atIndex >= 0)
                        command = command.substring(1, atIndex);
                    else
                        command = command.substring(1);
                    let to = command.replace('/_/g', '.');
                    convertFile(chatId, chatType, messageId, fileId, to);
                } else {
                    handleFile(chatId, chatType, messageId, fileId);
                }
            }
        }
    }
});

slimbot.on('callback_query', query => {
    let data = JSON.parse(query.data);
    if (data) {
        let message = query.message;
        let messageId = message.message_id;
        let chatId = message.chat.id;
        if (data.cancel) {
            clearTask(chatId);
            slimbot.answerCallbackQuery(query.id, { text: autoConversionSaved });
            slimbot.editMessageText(chatId, messageId, operationCancelled);
        } else {
            let conversion = {
                from: data.from,
                to: data.to
            };
            let chatFilter = { _id: chatId };
            let element = { auto: conversion };
            let update;
            if (data.auto) {
                update = { $pull: element };
            } else {
                update = { $addToSet: element };
            }
            db.collection('tasks').updateOne(chatFilter, update, null, (err, obj) => {
                if (err) debugLog(err); else {
                    slimbot.answerCallbackQuery(query.id, { text: autoConversionSaved });
                    if (obj && obj.modifiedCount > 0) {
                        conversion.auto = !data.auto;
                        slimbot.editMessageReplyMarkup(chatId, messageId, buildAutoConversionReplyMarkup(conversion));
                    }
                }
            });
        }
    }
});

function handleCommand(chatId, chatType, messageId, command, options) {
    if (command.startsWith('/start')) {
        registerChat(chatId);
        let response;
        if (chatType === 'private') {
            response = helpmsgPrivate;
        } else {
            response = helpmsgStartGroups;
        }
        slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
    } else if (command.startsWith('/help')) {
        let response;
        if (chatType === 'private') {
            response = helpmsgPrivate;
        } else {
            response = helpmsgGroups;
        }
        slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
    } else if (command.startsWith('/cancel')) {
        clearTask(chatId);
        slimbot.sendMessage(chatId, operationCancelled);
    } else if (command.startsWith('/balance')) {
        let chatFilter = { _id: chatId };
        db.collection('tasks').findOne(chatFilter, (err, doc) => {
            if (err) debugLog(err); else {
                let apiKey = process.env.CLOUD_CONVERT_API_TOKEN;
                if (doc && doc.hasOwnProperty('api_key')) {
                    apiKey = doc.api_key;
                }
                https.get('https://api.cloudconvert.com/user?apikey=' + apiKey, res => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        let response = JSON.parse(data);
                        let balance = response.minutes;
                        slimbot.sendMessage(chatId, remainingConversions + ': <b>'
                            + balance + '</b>\n\n' + customApiKeyInstruction, { parse_mode: 'html' });
                    });
                }).on("error", err => { if (err) debugLog(err); });
            }
        });
    } else if (command.startsWith('/the_more_the_merrier')) {
        let chatFilter = { _id: chatId };
        db.collection('tasks').findOne(chatFilter, (err, doc) => {
            if (err) debugLog(err); else {
                let response;
                if (doc && doc.hasOwnProperty('api_key')) {
                    response = helpmsgBalanceWithApiKey + '\n<pre>' + doc.api_key + '</pre>\n\n' + helpmsgBuyMinutes;
                } else {
                    response = helpmsgSetUpAccount;
                }
                slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
            }
        });
    } else if (command.startsWith('/feedback')) {
        slimbot.sendMessage(chatId, helpmsgFeedback, { parse_mode: 'html' });
    } else if (command.startsWith('/limitations')) {
        slimbot.sendMessage(chatId, helpmsgLimitations, { parse_mode: 'html' });
    } else if (command.startsWith('/apikey')) {
        let apiKey = options.original.substring('/apikey'.length).trim();
        if (apiKey.startsWith('@')) {
            apiKey = apiKey.substring(botName.length + 1);
        }
        if (apiKey && apiKey.length > 0) {
            saveApiKey(chatId, apiKey);
        } else {
            slimbot.sendMessage(chatId, sendApiKey, {
                parse_mode: 'html',
                reply_to_message_id: messageId,
                reply_markup: JSON.stringify({ force_reply: true, selective: true })
            });
        }
    } else if (command.startsWith('/info')) {
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            findFileInfoByFileId(chatId, fileId);
        } else {
            let chatFilter = { _id: chatId };
            db.collection('tasks').findOne(chatFilter, (err, doc) => {
                if (err) debugLog(err); else {
                    let fileId;
                    if (doc && doc.hasOwnProperty('task')) {
                        let task = doc.task;
                        if (task.hasOwnProperty('file_id')) {
                            fileId = task.file_id;
                        }
                    }
                    if (fileId) {
                        findFileInfoByFileId(chatId, fileId);
                    } else {
                        slimbot.sendMessage(chatId, helpmsgInfo);
                    }
                }
            });
        }
    } else if (command.startsWith('/convert')) {
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            let chatFilter = { _id: chatId };
            let update = { 'task': { 'file_id': fileId } };
            db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
            findConversionOptionsByFileId(chatId, chatType, messageId, fileId);
        } else {
            slimbot.sendMessage(chatId, helpmsgConvert);
        }
    } else {
        let atIndex = command.indexOf('@');
        if (atIndex >= 0)
            command = command.substring(1, atIndex);
        else
            command = command.substring(1);
        let to = command.replace('/_/g', '.');
        let chatFilter = { _id: chatId };
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            convertFile(chatId, chatType, messageId, fileId, to);
        } else {
            db.collection('tasks').findOne(chatFilter, (err, doc) => {
                if (err) debugLog(err); else {
                    let fileId;
                    if (doc && doc.hasOwnProperty('task')) {
                        let task = doc.task;
                        if (task.hasOwnProperty('file_id')) {
                            fileId = task.file_id;
                        }
                    }
                    if (fileId) {
                        convertFile(chatId, chatType, messageId, fileId, to);
                    } else {
                        let update = { 'task': { 'to': to } };
                        db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
                        slimbot.sendMessage(chatId, helpmsgFile + to + '!', { reply_markup: buildCancelOperationReplyMarkup() });
                    }
                }
            });
        }
    }
}

function handleText(chatId, chatType, messageId, text) {
    if (chatType === 'private') {
        slimbot.sendMessage(chatId, helpmsgText);
    }
}

function handleFile(chatId, chatType, messageId, fileId) {
    let chatFilter = { _id: chatId };
    let collection = db.collection('tasks');
    collection.findOne(chatFilter, (err, doc) => {
        if (err) debugLog(err); else {
            let to;
            let converted = false;
            if (doc && doc.hasOwnProperty('task')) {
                let task = doc.task;
                if (task.hasOwnProperty('to')) {
                    to = task.to;
                }
            }
            if (to) {
                converted = true;
                convertFile(chatId, chatType, messageId, fileId, to);
            } else {
                let update = { 'task': { 'file_id': fileId } };
                collection.updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
            }
            slimbot.getFile(fileId).then(response => {
                let result = response.result;
                let from = getExtension(result.file_path);
                let size = result.file_size;
                collection.findOne(chatFilter, { projection: { auto: 1 } }, (err, doc) => {
                    if (err) debugLog(err); else {
                        if (doc && doc.hasOwnProperty('auto')) {
                            let autoConversions = doc.auto.filter(c => c.from === from);
                            if (autoConversions.length > 0) {
                                converted = true;
                                autoConversions.forEach(c => convertFile(chatId, chatType, messageId, fileId, c.to));
                            }
                        }
                        if (!converted && chatType === 'private') {
                            findConversionOptions(chatId, chatType, messageId, from, size);
                        }
                    }
                });
            });
        }
    });
}

function convertFile(chatId, chatType, messageId, fileId, to) {

    clearTask(chatId);

    if (isDevBot) {
        slimbot.sendMessage(chatId, '[conversion skipped for debug purpose]', { reply_to_message_id: messageId });
        slimbot.sendMessage(chatId, 'Would have converted in chat ' + chatId
            + ' of type ' + chatType
            + ' for message ' + messageId
            + ' file ' + fileId
            + ' to ' + to);
        return;
    }

    slimbot.sendMessage(chatId, String.fromCodePoint(0x1f914), {
        reply_to_message_id: messageId
    }).then(statusMessage => {
        slimbot.getFile(fileId).then(response => {
            let chatFilter = { _id: chatId };
            db.collection('tasks').findOne(chatFilter, { projection: { api_key: 1 } }, (err, doc) => {
                if (err) {
                    slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                    debugLog(err);
                } else {
                    let apiKey = undefined;
                    let cc = cloudconvert;
                    if (doc && doc.hasOwnProperty('api_key')) {
                        apiKey = doc.api_key;
                        cc = new CloudConvert(apiKey);
                    }
                    let filePath = response.result.file_path;
                    let from = getExtension(filePath);
                    cc.createProcess({
                        "inputformat": from,
                        "outputformat": to
                    }, (err, process) => {
                        if (err) {
                            if (err.code === 400) {
                                slimbot.editMessageText(chatId, statusMessage.result.message_id, unsupportedConversion
                                    + ' (' + from + ' to ' + to + ')');
                            } else if (err.code === 402) {
                                slimbot.editMessageText(chatId, statusMessage.result.message_id, noMoreConversionMinutes);
                            } else if (err.code === 403) {
                                slimbot.editMessageText(chatId, statusMessage.result.message_id, invalidApiKey
                                    + '<pre>' + apiKey + '</pre>', { parse_mode: 'html' });
                            } else if (err.code === 422) {
                                slimbot.editMessageText(chatId, statusMessage.result.message_id, conversionError
                                    + ' (' + from + ' to ' + to + ')\n\n' + err.message);
                            } else {
                                slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                debugLog(err);
                            }
                        } else {
                            let url = 'https://api.telegram.org/file/bot' + botApiToken + '/' + filePath;
                            process.start({
                                "input": "download",
                                "file": url,
                                "outputformat": to
                            }, (err, process) => {
                                if (err) {
                                    if (err.code === 422) {
                                        slimbot.editMessageText(chatId, statusMessage.result.message_id, conversionError
                                            + ' (' + from + ' to ' + to + ')\n\n' + err.message);
                                    } else {
                                        slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                        debugLog(err);
                                    }
                                } else {
                                    let conversion = {
                                        from: from,
                                        to: to
                                    };
                                    db.collection('tasks').findOne({
                                        _id: chatId,
                                        auto: conversion
                                    }, (err, doc) => {
                                        if (err) {
                                            slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                            debugLog(err);
                                        } else {
                                            conversion.auto = doc ? true : false; // used for stats and reply markup
                                            let options = {
                                                reply_to_message_id: messageId,
                                                reply_markup: buildAutoConversionReplyMarkup(conversion)
                                            };
                                            process.wait((err, process) => {
                                                if (err) {
                                                    if (err.code === 422) {
                                                        slimbot.editMessageText(chatId, statusMessage.result.message_id, conversionError
                                                            + ' (' + from + ' to ' + to + ')\n\n' + err.message);
                                                    } else {
                                                        slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                                        debugLog(err);
                                                    }
                                                } else {
                                                    let tmpPath = '/tmp/' + path.basename(filePath, from) + '.' + to;
                                                    process.download(fs.createWriteStream(tmpPath), null, err => {
                                                        if (err) {
                                                            slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                                            debugLog(err);
                                                        } else {
                                                            slimbot.sendChatAction(chatId, 'upload_document');
                                                            let file = fs.createReadStream(tmpPath);
                                                            slimbot.deleteMessage(chatId, statusMessage.result.message_id);
                                                            slimbot.sendDocument(chatId, file, options).then(() => fs.unlink(tmpPath, err => {
                                                                if (err) {
                                                                    slimbot.editMessageText(chatId, statusMessage.result.message_id, unknownError);
                                                                    debugLog(err);
                                                                } else {
                                                                    db.collection('stats').insertOne({
                                                                        chat_id: chatId,
                                                                        conversion: conversion,
                                                                        completed: new Date()
                                                                    });
                                                                }
                                                            }));
                                                            process.delete();
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        });
    });
}

function findFileInfoByFileId(chatId, fileId) {
    slimbot.getFile(fileId).then(response => {
        let filePath = response.result.file_path;
        let from = getExtension(filePath);
        let url = 'https://api.telegram.org/file/bot' + botApiToken + '/' + filePath;
        cloudconvert.createProcess({
            'inputformat': from,
            'outputformat': from,
            'mode': 'info'
        }, (err, process) => {
            if (err) debugLog(err); else {
                process.start({
                    'mode': 'info',
                    'input': 'download',
                    'file': url
                }, (err, process) => {
                    if (err) debugLog(err); else {
                        process.wait((err, process) => {
                            if (err) debugLog(err); else {
                                let message = '';
                                let info = process.data.info;
                                for (key in info) {
                                    message += '<b>' + key + '</b>: ' + JSON.stringify(info[key], null, 4) + '\n';
                                }
                                slimbot.sendMessage(chatId, message, { parse_mode: 'html' });
                            }
                        });
                    }
                });
            }
        });
    });
}

function clearTask(chatId) {
    let chatFilter = { _id: chatId };
    let update = { 'task': {} };
    db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => { if (err) debugLog(err); });
}

function buildAutoConversionReplyMarkup(conversion) {
    let buttonText = 'auto-convert ' + conversion.from
        + ' to ' + conversion.to + ': '
        + (conversion.auto ? String.fromCodePoint(0x2705) : String.fromCodePoint(0x274c));
    return JSON.stringify({
        inline_keyboard: [[
            {
                text: buttonText,
                callback_data: JSON.stringify(conversion)
            }
        ]]
    });
}

function buildCancelOperationReplyMarkup() {
    let buttonText = cancelOperation;
    return JSON.stringify({
        inline_keyboard: [[
            {
                text: buttonText,
                callback_data: JSON.stringify({ cancel: true })
            }
        ]]
    });
}

function findConversionOptionsByFileId(chatId, chatType, messageId, fileId, size) {
    slimbot.getFile(fileId).then(response => {
        let from = getExtension(response.result.file_path);
        findConversionOptions(chatId, chatType, messageId, from, size);
    });
}

function findConversionOptions(chatId, chatType, messageId, from, size) {
    https.get('https://api.cloudconvert.com/conversiontypes?inputformat=' + from, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            let formats = JSON.parse(data);
            showConversionOptions(chatId, chatType, messageId, from, formats, size);
        });
    }).on("error", err => debugLog(err));
}

function showConversionOptions(chatId, chatType, messageId, from, formats, size) {
    let categories = formats.map(f => f.group).reduce((a, b) => {
        if (a.indexOf(b) < 0)
            a.push(b);
        return a;
    }, []);
    let message = 'Awesome! I can convert this ' + from + (size ? ' (' + prettyBytes(size) + ')' : '') + ' to:\n'
        + categories.map(c =>
            '<b>' + c + '</b>\n'
            + formats.filter(f => f.group === c)
                .map(f => '/' + f.outputformat
                    .replace(/ /g, "_")
                    .replace(/\./g, '_') + ' (<i>' + f.outputformat + '</i>)')
                .join('\n')
        ).join('\n\n');
    let options = {
        parse_mode: 'html',
        reply_markup: buildCancelOperationReplyMarkup()
    };
    if (chatType !== 'private') {
        options.reply_to_message_id = messageId;
    }
    slimbot.sendMessage(chatId, message, options);
}

function getExtension(fileName) {
    let re = /(?:\.([^.]+))?$/; // extract file extension, see https://stackoverflow.com/a/680982
    return re.exec(fileName)[1].toLowerCase();
}

function registerChat(chatId) {
    let chatFilter = { _id: chatId };
    let collection = db.collection('tasks');
    collection.deleteOne(chatFilter, null, () =>
        collection.insertOne({ _id: chatId }));
}

function unregisterChat(chatId) {
    let collection = db.collection('tasks');
    collection.deleteOne({ _id: chatId });
}

function saveApiKey(chatId, apiKey) {
    slimbot.sendMessage(chatId, validatingApiKey).then(statusMessage => {
        let messageId = statusMessage.result.message_id;
        https.get('https://api.cloudconvert.com/user?apikey=' + apiKey, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let response = JSON.parse(data);
                let user = response.user;
                if (user) {
                    let chatFilter = { _id: chatId };
                    let update = { 'api_key': apiKey };
                    db.collection('tasks').updateOne(chatFilter, { $set: update }, null, err => {
                        if (err) {
                            debugLog(err);
                            slimbot.editMessageText(chatId, messageId, unknownError);
                        } else {
                            slimbot.editMessageText(chatId, messageId, '<b>' + user + '</b>\n' + apiKeyProvided, { parse_mode: 'html' });
                        }
                    });
                } else {
                    slimbot.editMessageText(chatId, messageId, cannotSetApiKey);
                }
            });
        }).on("error", () => slimbot.editMessageText(chatId, messageId, unknownError));
    });
}

function debugLog(err) {
    console.trace(err);
    let log = JSON.stringify({ err: err, trace: new Error().stack });
    slimbot.sendMessage(-1001218552688, '<pre>' + log + '</pre>', { parse_mode: 'html' });
}
