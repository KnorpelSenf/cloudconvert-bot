// environment vars
require('dotenv').config();

import { get } from 'axios';
import Promise, { all, promisify } from 'bluebird';

import { MongoClient } from 'mongodb';
import { createWriteStream, createReadStream, unlink } from 'fs';
import { basename } from 'path';

import prettyBytes from 'pretty-bytes';

// texts and strings
import {
    helpmsgAddedToGroup, sendApiKey, autoConversionSaved,
    operationCancelled, helpmsgPrivate, helpmsgStartGroups,
    helpmsgGroups, remainingConversions, customApiKeyInstruction,
    helpmsgBalanceWithApiKey, helpmsgBuyMinutes, helpmsgSetUpAccount,
    helpmsgFeedback, helpmsgLimitations, helpmsgInfo,
    helpmsgConvert, helpmsgFile, helpmsgText,
    unsupportedConversion, noMoreConversionMinutes, invalidApiKey,
    conversionError, unknownError, unknownErrorPerhaps,
    cancelOperation, validatingApiKey, apiKeyProvided,
    cannotSetApiKey
} from './strings';

// Prevent zeit.co from restarting the bot
require('https').createServer().listen(3000);

import CloudConvert from 'cloudconvert';
const cloudconvert = new CloudConvert(process.env.CLOUD_CONVERT_API_TOKEN);

const botApiToken = process.env.BOT_API_TOKEN;
import Slimbot from 'slimbot';
const slimbot = new Slimbot(botApiToken);

var botId; // id of self
var botName; // name of self
var isDevBot; // tells whether we're in dev mode or not

// Connection URL
const url = 'mongodb://bot:' + process.env.MONGO_DB_PASSWORD + '@ds255403.mlab.com:55403/cloudconvert-bot';

// Database Name
const dbName = 'cloudconvert-bot';
var db;

// Create a new MongoClient
const client = new MongoClient(url, { useNewUrlParser: true });

// Use connect method to connect to the Server
client.connect().then(() => {
    console.log('Connected successfully to database server');
    db = client.db(dbName);
    return db.collection('tasks').countDocuments();
}).then(c => {
    console.log('Number of used chats: ' + c);
    return slimbot.getMe();
}).then(response => {
    let result = response.result;
    botId = result.id;
    botName = result.username;
    isDevBot = false; // botName.indexOf('dev') >= 0;
    // wait for messages
    console.log('Start polling at ' + new Date());
    slimbot.startPolling();
}).catch(err => {
    console.err('Now that\'s bad! Bot failed to start: ' + err);
});

// Giant message parsing
slimbot.on('message', message => {
    let chat = message.chat;
    let chatId = chat.id;
    let chatType = chat.type;
    let messageId = message.message_id;

    if (message.hasOwnProperty('new_chat_members')) {
        // bot was added to group

        let botWasAdded = message.new_chat_members.some(user => user.id === botId);
        if (botWasAdded) {
            registerChat(chatId);
            slimbot.sendMessage(chatId, helpmsgAddedToGroup, { parse_mode: 'html' });
        }

    } else if (message.hasOwnProperty('left_chat_member')) {
        // bot was removed from group

        let botWasRemoved = message.left_chat_member.id === botId;
        if (botWasRemoved) {
            unregisterChat(chatId);
        }

    } else if (message.hasOwnProperty('text')) {
        // bot actually received a text message

        let text = message.text;
        let options = { original: text };
        let lowerText = text.toLowerCase();

        if (message.hasOwnProperty('reply_to_message')) {
            // text message was a reply
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

        // text message will be handled differently
        // depeding on whether it is a bot command or not
        if (message.hasOwnProperty('entities')
            && message.entities[0].type === 'bot_command'
            && message.entities[0].offset === 0
            && (lowerText.indexOf('@') < 0 || lowerText.endsWith(botName))) {
            // bot command
            handleCommand(chatId, chatType, messageId, lowerText, options);
        } else {
            // regular text message
            handleText(chatId, chatType, messageId, text, options);
        }

    } else {
        // bot received a file or sticker or something!
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
                // file extension parsing:
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
                // perhaps the command allows us to convert the file right away
                if (command) {
                    command = command.toLowerCase();
                    let atIndex = command.indexOf('@');
                    if (atIndex >= 0)
                        command = command.substring(1, atIndex);
                    else
                        command = command.substring(1);
                    let to = command.replace('/_/g', '.');
                    // great, now we can convert our file
                    convertFile(chatId, chatType, messageId, fileId, to);
                } else {
                    // store the file for later conversion
                    handleFile(chatId, chatType, messageId, fileId);
                }
            }
        }
    }
});
// End of giant message parsing

// Callback query parsing
slimbot.on('callback_query', query => {
    let data = JSON.parse(query.data);
    if (data) {
        let message = query.message;
        let messageId = message.message_id;
        let chatId = message.chat.id;
        if (data.cancel) {
            // Conversion was cancelled
            clearTask(chatId);
            slimbot.answerCallbackQuery(query.id, { text: autoConversionSaved });
            slimbot.editMessageText(chatId, messageId, operationCancelled);
        } else {
            // Auto-conversion was toggled
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
            db.collection('tasks').updateOne(chatFilter, update, null).then(obj => {
                slimbot.answerCallbackQuery(query.id, { text: autoConversionSaved });
                if (obj && obj.modifiedCount > 0) {
                    conversion.auto = !data.auto;
                    slimbot.editMessageReplyMarkup(chatId, messageId, buildAutoConversionReplyMarkup(conversion));
                }
            }).catch(debugLog);
        }
    }
});
// End of callback query parsing

// Called if a bot command was received
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
        db.collection('tasks').findOne(chatFilter).then(doc => {
            let apiKey = process.env.CLOUD_CONVERT_API_TOKEN;
            if (doc && doc.hasOwnProperty('api_key')) {
                apiKey = doc.api_key;
            }
            return get('https://api.cloudconvert.com/user?apikey=' + apiKey);
        }).then(response => {
            let balance = response.data.minutes;
            slimbot.sendMessage(chatId, remainingConversions + ': <b>'
                + balance + '</b>\n\n' + customApiKeyInstruction, { parse_mode: 'html' });
        }).catch(debugLog);
    } else if (command.startsWith('/the_more_the_merrier')) {
        let chatFilter = { _id: chatId };
        db.collection('tasks').findOne(chatFilter).then(doc => {
            let response;
            if (doc && doc.hasOwnProperty('api_key')) {
                response = helpmsgBalanceWithApiKey + '\n<pre>' + doc.api_key + '</pre>\n\n' + helpmsgBuyMinutes;
            } else {
                response = helpmsgSetUpAccount;
            }
            slimbot.sendMessage(chatId, response, { parse_mode: 'html' });
        }).catch(debugLog);
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
            db.collection('tasks').findOne(chatFilter).then(doc => {
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
            }).catch(debugLog);
        }
    } else if (command.startsWith('/convert')) {
        if (options.hasOwnProperty('file_id')) {
            let fileId = options.file_id;
            let chatFilter = { _id: chatId };
            let update = { 'task': { 'file_id': fileId } };
            db.collection('tasks').updateOne(chatFilter, { $set: update }).catch(debugLog);
            findConversionOptionsByFileId(chatId, chatType, messageId, fileId);
        } else {
            slimbot.sendMessage(chatId, helpmsgConvert);
        }
    } else {
        // if the command doesn't match anything we know, we assume it to be a file extension
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
            db.collection('tasks').findOne(chatFilter).then(doc => {
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
                    db.collection('tasks').updateOne(chatFilter, { $set: update }).catch(debugLog);
                    slimbot.sendMessage(chatId, helpmsgFile + to + '!', { reply_markup: buildCancelOperationReplyMarkup() });
                }
            }).catch(debugLog);
        }
    }
}

// Called if a regular text message was received
function handleText(chatId, chatType, messageId, text) {
    if (chatType === 'private') {
        slimbot.sendMessage(chatId, helpmsgText);
    }
}

// Called if a file or sticker or something was received
function handleFile(chatId, chatType, messageId, fileId) {
    let chatFilter = { _id: chatId };
    let collection = db.collection('tasks');
    collection.findOne(chatFilter).then(doc => {
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
            collection.updateOne(chatFilter, { $set: update }).catch(debugLog);
        }
        return all([
            converted,
            slimbot.getFile(fileId),
            collection.findOne(chatFilter, { projection: { auto: 1 } })
        ]);
    }).then(([converted, response, doc]) => {
        let result = response.result;
        let from = getExtension(result.file_path);
        let size = result.file_size;
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
    }).catch(debugLog);
}

// Performs the actual file conversion
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

    let chatFilter = { _id: chatId };
    let statusMessageContainer = { statusMessage: undefined };
    all([
        slimbot.sendMessage(chatId, String.fromCodePoint(0x1f914) /* <- thinking face emoji */, {
            reply_to_message_id: messageId
        }),
        slimbot.getFile(fileId),
        db.collection('tasks').findOne(chatFilter, { projection: { api_key: 1 } })
    ]).then(([statusMessage, response, doc]) => {
        statusMessageContainer.statusMessage = statusMessage;
        let apiKey = undefined;
        let cc = cloudconvert;
        if (doc && doc.hasOwnProperty('api_key')) {
            apiKey = doc.api_key;
            cc = new CloudConvert(apiKey);
        }
        let filePath = response.result.file_path;
        let from = getExtension(filePath);
        let conversion = {
            from: from,
            to: to
        };
        return all([
            promisify(cc.createProcess, { context: cc })({
                "inputformat": from,
                "outputformat": to
            }),
            filePath,
            conversion
        ]);
    }).then(([process, filePath, conversion]) => {
        let url = 'https://api.telegram.org/file/bot' + botApiToken + '/' + filePath;
        return all([
            filePath,
            conversion,
            promisify(process.start, { context: process })({
                "input": "download",
                "file": url,
                "outputformat": to
            }),
            db.collection('tasks').findOne({
                _id: chatId,
                auto: conversion
            })
        ]);
    }).then(([filePath, conversion, process, doc]) => {
        conversion.auto = doc ? true : false; // used for stats and reply markup
        return all([
            conversion,
            promisify(process.wait, { context: process })(),
            filePath
        ]);
    }).then(([conversion, process, filePath]) => {
        let tmpPath = '/tmp/' + basename(filePath, conversion.from) + to;
        return all([
            conversion,
            // process.download is not even conform to the convention that the last parameter is the callback
            // -> can't use promisify, must use Promise constructor instead
            new Promise((resolve, reject) => {
                process.download(createWriteStream(tmpPath), null, (err, process) => {
                    if (err)
                        reject(err)
                    else
                        resolve(process)
                })
            }),
            tmpPath
        ]);
    }).then(([conversion, process, tmpPath]) => {
        process.delete();
        let options = {
            reply_to_message_id: messageId,
            reply_markup: buildAutoConversionReplyMarkup(conversion)
        };
        let file = createReadStream(tmpPath);
        let fileSentContainer = { sent: false };
        // Count the number of times we send the chat action "upload_document".
        // Stop after one minute maximum.
        let chatActionSenderCount = 0;
        let chatActionSender = () => {
            chatActionSenderCount++;
            if (!fileSentContainer.sent && chatActionSenderCount < 12) {
                slimbot.sendChatAction(chatId, 'upload_document');
                setTimeout(chatActionSender, 5000);
            }
        }
        chatActionSender();
        let statusMessageId = statusMessageContainer.statusMessage.result.message_id;
        statusMessageContainer.statusMessage = undefined;
        slimbot.deleteMessage(chatId, statusMessageId);
        return all([
            conversion,
            tmpPath,
            fileSentContainer,
            slimbot.sendDocument(chatId, file, options)
        ]);
    }).then(([conversion, tmpPath, fileSentContainer, request]) => {
        fileSentContainer.sent = true;
        db.collection('stats').insertOne({
            chat_id: chatId,
            conversion: conversion,
            completed: new Date()
        });
        unlink(tmpPath, err => { if (err) throw err });
    }).catch(err => {
        let statusMessage = statusMessageContainer.statusMessage;
        if (statusMessage) {
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
            slimbot.sendMessage(chatId, unknownErrorPerhaps)
            debugLog(err);
        }
    });
}

function findFileInfoByFileId(chatId, fileId) {
    let chatFilter = { _id: chatId };
    all([
        db.collection('tasks').findOne(chatFilter, { projection: { api_key: 1 } }),
        slimbot.getFile(fileId)
    ]).then(([doc, response]) => {
        let cc = cloudconvert;
        if (doc && doc.hasOwnProperty('api_key')) {
            apiKey = doc.api_key;
            cc = new CloudConvert(apiKey);
        }
        let filePath = response.result.file_path;
        let from = getExtension(filePath);
        let url = 'https://api.telegram.org/file/bot' + botApiToken + '/' + filePath;
        return all([
            url,
            promisify(cc.createProcess, { context: cc })({
                'inputformat': from,
                'outputformat': from,
                'mode': 'info'
            })
        ]);
    }).then(([url, process]) => {
        return promisify(process.start, { context: process })({
            'mode': 'info',
            'input': 'download',
            'file': url
        });
    }).then(process => {
        return promisify(process.wait, { context: process })();
    }).then(process => {
        let message = '';
        let info = process.data.info;
        for (key in info) {
            message += '<b>' + key + '</b>: ' + JSON.stringify(info[key], null, 4) + '\n';
        }
        slimbot.sendMessage(chatId, message, { parse_mode: 'html' });
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
    get('https://api.cloudconvert.com/conversiontypes?inputformat=' + from).then(response => {
        let formats = response.data;
        showConversionOptions(chatId, chatType, messageId, from, formats, size);
    }).catch(debugLog);
}

function showConversionOptions(chatId, chatType, messageId, from, formats, size) {
    // group formats by category
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
    collection.deleteOne(chatFilter).then(() =>
        collection.insertOne({ _id: chatId }));
}

function unregisterChat(chatId) {
    let collection = db.collection('tasks');
    collection.deleteOne({ _id: chatId });
}

function saveApiKey(chatId, apiKey) {
    slimbot.sendMessage(chatId, validatingApiKey).then(statusMessage => {
        let messageId = statusMessage.result.message_id;
        return all([
            messageId,
            get('https://api.cloudconvert.com/user?apikey=' + apiKey)
        ]);
    }).then(([messageId, response]) => {
        let user = response.data.user;
        if (user) {
            let chatFilter = { _id: chatId };
            let update = { 'api_key': apiKey };
            db.collection('tasks').updateOne(chatFilter, { $set: update }).then(() => {
                slimbot.editMessageText(chatId, messageId, '<b>' + user + '</b>\n' + apiKeyProvided, { parse_mode: 'html' });
            });
        } else {
            slimbot.editMessageText(chatId, messageId, cannotSetApiKey);
        }
    }).catch(() => {
        slimbot.editMessageText(chatId, messageId, unknownError);
    });
}

function debugLog(err) {
    let log = JSON.stringify({ err, trace: new Error().stack }, null, 2);
    slimbot.sendMessage(-1001218552688 /* <- debug log channel */, '<pre>' + log + '</pre > ', { parse_mode: 'html' });
}







    /*

    private async handleMessage(message: Message): Promise<void> {
        if (this.processBotWasAdded(message)
            || this.processBotWasRemoved(message)) {
            return;
        }

        const task = await this.db.getTaskInformation(message.chat);

        // Each of the following attempt-methods potentially adds information about the task.
        // If one of the methods can handle the message entirely on its own, it will
        // return true as to intercept the chain. This will also prevent a conversion
        // attempt.
        //
        // Example szenario 1: /help was sent -> intercepted -> no need to request a file
        // Example szenario 2: foo was sent -> not intercepted -> ask user to send a file
        const intercepted: boolean = this.processReply(task, message)
            || this.processText(task, message)
            || this.processMiscellaneous(task, message);

        if (!intercepted) {
            // Now we can try to perform the task as it might be complete
            this.tryPerform(task, message);
        }
    }

    private processBotWasAdded(message: Message): boolean {
        if (this.botInfo === undefined) {
            return false;
        }
        const botId = this.botInfo.bot_id;
        const botWasAdded = message.new_chat_members !== undefined
            && message.new_chat_members.some(user => user.id === botId);
        if (botWasAdded) {
            this.db.registerChat(message.chat);
            this.bot.sendMessage(message.chat.id, strings.helpmsgAddedToGroup, { parse_mode: 'HTML' });
        }
        return botWasAdded;
    }

    private processBotWasRemoved(message: Message): boolean {
        if (this.botInfo === undefined) {
            return false;
        }
        const botId = this.botInfo.bot_id;
        const botWasRemoved = message.left_chat_member !== undefined
            && message.left_chat_member.id === botId;
        if (botWasRemoved) {
            this.db.unregisterChat(message.chat);
        }
        return botWasRemoved;
    }

    private processReply(task: Partial<Task>, message: Message): boolean {
        const reply = message.reply_to_message;
        if (reply === undefined) {
            return false;
        }
        if (this.botInfo !== undefined && reply.from !== undefined
            && reply.from.id === this.botInfo.bot_id && reply.text === strings.sendApiKey) {
            if (message.text === undefined) {
                this.bot.sendMessage(message.chat.id, strings.invalidApiKeyType, {
                    reply_to_message_id: reply.message_id,
                });
            } else if (message.text.startsWith('/')) {
                this.bot.sendMessage(message.chat.id, strings.invalidApiKeyCommand, {
                    reply_to_message_id: reply.message_id,
                });
            } else {
                this.saveApiKey(message.chat, message.text);
                return true;
            }
        } else {
            let file: FileBase | undefined;
            if (reply.photo !== undefined) {
                file = reply.photo[reply.photo.length - 1];
            } else {
                file = reply.audio || reply.document || reply.sticker
                    || reply.video || reply.voice || reply.video_note;
            }

            if (file !== undefined) {
                task.file_id = file.file_id;
            }
        }
        return false;
    }

    private processText(task: Partial<Task>, message: Message): boolean {
        const reply = message.reply_to_message;
        if (this.botInfo !== undefined && reply !== undefined && reply.from !== undefined
            && reply.from.id === this.botInfo.bot_id && reply.text === strings.sendApiKey) {
            if (message.text === undefined) {
                this.bot.sendMessage(message.chat.id, strings.invalidApiKeyType, {
                    reply_to_message_id: reply.message_id,
                });
            } else if (message.text.startsWith('/')) {
                this.bot.sendMessage(message.chat.id, strings.invalidApiKeyCommand, {
                    reply_to_message_id: reply.message_id,
                });
            } else {
                this.saveApiKey(message.chat, message.text);
            }
            return true;
        }

        const command = this.extractCommand(message);
        if (command !== undefined) {
            return this.processCommand(command, task, message);
        } else if (message.chat.type === 'private') {
            this.bot.sendMessage(message.chat.id, strings.helpmsgText);
            return true;
        } else {
            return false;
        }
    }

    private processCommand(command: string, task: Partial<Task>, message: Message): boolean {
        switch (command) {
            case '/start':
                this.db.registerChat(message.chat);
                this.bot.sendMessage(message.chat.id,
                    message.chat.type === 'private'
                        ? strings.helpmsgPrivate
                        : strings.helpmsgStartGroups,
                    { parse_mode: 'HTML' });
                break;

            case '/help':
                this.bot.sendMessage(message.chat.id,
                    message.chat.type === 'private'
                        ? strings.helpmsgPrivate
                        : strings.helpmsgGroups,
                    { parse_mode: 'HTML' });
                break;

            case '/cancel':
                this.db.clearTask(message.chat);
                this.bot.sendMessage(message.chat.id, strings.operationCancelled);
                break;

            case '/balance':
                cloudconvert.getBalance(task.api_key).then(balance =>
                    this.bot.sendMessage(message.chat.id,
                        strings.remainingConversions + ': <b>' + balance + '</b>\n\n' + strings.customApiKeyInstruction,
                        { parse_mode: 'HTML' }),
                );
                break;

            case '/the_more_the_merrier':
                if (task.api_key === undefined) {
                    this.bot.sendMessage(message.chat.id, strings.helpmsgSetUpAccount);
                } else {
                    this.bot.sendMessage(message.chat.id,
                        strings.helpmsgBalanceWithApiKey
                        + '\n<pre>' + task.api_key + '</pre>\n\n'
                        + strings.helpmsgBuyMinutes);
                }
                break;

            case '/feedback':
                this.bot.sendMessage(message.chat.id, strings.helpmsgFeedback, { parse_mode: 'HTML' });
                break;

            case '/limitations':
                this.bot.sendMessage(message.chat.id, strings.helpmsgLimitations, { parse_mode: 'HTML' });
                break;

            case '/apikey':
                if (message.text !== undefined && this.botInfo !== undefined) {
                    let apiKey = message.text.substring('/apikey'.length).trim();
                    if (apiKey.startsWith('@')) {
                        apiKey = apiKey.substring(this.botInfo.bot_name.length + 1);
                    }
                    if (apiKey && apiKey.length > 0) {
                        this.saveApiKey(message.chat, apiKey);
                    } else {
                        this.bot.sendMessage(message.chat.id, strings.sendApiKey, {
                            parse_mode: 'HTML',
                            reply_to_message_id: message.message_id,
                            reply_markup: { force_reply: true, selective: true },
                        });
                    }
                } else { // should never happen
                    this.bot.sendMessage(message.chat.id, strings.unknownError);
                }
                break;

            case '/info':
                throw new Error('Not implemented yet! Stay tuned!');

            case '/convert':
                // If this command was used correctly, the reply already provided
                // the correct file and thus task.file_id should be set.
                // If not, send back usage instructions.
                if (task.file_id === undefined) {
                    this.bot.sendMessage(message.chat.id, strings.helpmsgConvert);
                }
                break;
            default:
                throw new Error('Not implemented yet');
        }

        return true; // command intercepted
    }

    private processMiscellaneous(task: Partial<Task>, message: Message): boolean {
        return false;
    }

    private async saveApiKey(chat: Chat, key: string) {
        const [statusMessage, username] = await Promise.all([
            this.bot.sendMessage(chat.id, strings.validatingApiKey),
            cloudconvert.validateApiKey(key),
        ]);
        const options = { message_id: statusMessage.message_id };
        if (username === undefined) {
            await this.bot.editMessageText(strings.cannotSetApiKey, options);
        } else {
            await Promise.all([
                this.bot.editMessageText('<b>' + username + '</b>\n' + strings.apiKeyProvided, options),
                this.db.saveApiKey(chat, key),
            ]);
        }
    }

    private extractCommand(message: Message): string | undefined {
        if (this.botInfo === undefined
            || message.text === undefined
            || message.entities === undefined
            || message.entities.length === 0) {
            return undefined;
        }
        const entity = message.entities[0];
        if (entity === undefined
            || entity.type !== 'bot_command'
            || entity.offset !== 0) {
            return undefined;
        }
        let command = message.text.substring(entity.offset, entity.offset + entity.length);
        if (command.includes('@')) { // strip potentially included bot name
            command = command.substring(0, command.indexOf('@'));
        }
        return command;
    }

    private tryPerform(task: Partial<Task>, message: Message) {
    }
    */
