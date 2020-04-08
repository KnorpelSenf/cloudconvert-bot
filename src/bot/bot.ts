import { Firestore } from '@google-cloud/firestore'
import d from 'debug'
import express from 'express'
import path from 'path'
import Telegraf from 'telegraf'
import TelegrafI18n, { I18n } from 'telegraf-i18n'
import firestoreSession from 'telegraf-session-firestore'
import { User } from 'telegraf/typings/telegram-types'
import * as apiKeys from './controllers/apikey-controller'
import * as callbacks from './controllers/callback-controller'
import * as commands from './controllers/command-controller'
import * as fallbacks from './controllers/fallback-controller'
import * as files from './controllers/file-controller'
import * as groups from './controllers/group-controller'
import commandArgs from './middlewares/command-args'
import TaskContext from './models/task-context'
const debug = d('bot:main')

// ID of the dev's dedicated debug log channel
const adminId = process.env.ADMIN_ID

export interface BotInfo extends User {
    isDevBot: boolean
}

export default class Bot {
    private bot: Telegraf<TaskContext>

    public constructor() {
        // Init bot with bot token
        const token = process.env.BOT_API_TOKEN
        if (token === undefined) {
            throw new Error(
                'No API token provided in environ var BOT_API_TOKEN!'
            )
        }
        this.bot = new Telegraf(token, { telegram: { webhookReply: false } })

        // Make session data available
        const db = new Firestore({
            projectId: 'cloudconvert-bot-257814',
            keyFilename: 'firestore-keyfile.json',
        })
        this.bot.use(
            firestoreSession(db.collection('sessions'), {
                getSessionKey: (ctx: TaskContext) => ctx.chat?.id.toString(),
                // TODO: make telegraf-i18n support lazy mode
            })
        )

        // Make DB available directly
        this.bot.context.db = db

        // Make internationalization available
        const i18n = new TelegrafI18n({
            defaultLanguage: 'en',
            useSession: true,
            sessionName: 'session',
            defaultLanguageOnMissing: true,
            directory: path.resolve(__dirname, 'locales'),
        })
        this.bot.use(i18n.middleware())

        const supportedLanguages = i18n
            .availableLocales()
            .sort()
            .map(l => ({
                locale: l,
                name: ((i18n.createContext(l, {}) as unknown) as I18n).t(
                    'languageName'
                ),
            }))
        this.bot.context.supportedLanguages = supportedLanguages

        // Make arg parsing available
        this.bot.use(commandArgs())

        debug('Available locales are', i18n.availableLocales())
        debug('Bot initialized.')
    }

    public async start(): Promise<void> {
        const me = await this.bot.telegram.getMe()
        const username = me.username || ''
        const isDevBot = username.includes('dev')
        this.bot.context.botInfo = {
            ...me,
            isDevBot,
        }

        this.bot.options.username = username
        // Listeners (esp. for commands) can only be registered now that the bot name is known
        this.registerListeners()

        if (isDevBot) {
            await this.bot.telegram.deleteWebhook()
            this.bot.startPolling()
            debug(
                'Bot @' +
                    username +
                    ' started using long polling at ' +
                    new Date()
            )
        } else {
            const port = process.env.PORT || 8080
            const url =
                'https://cloudconvert-bot-257814.appspot.com:443/' +
                this.bot.token
            const app = express()
            app.use(this.bot.webhookCallback('/' + this.bot.token))
            app.listen(port)
            await this.bot.telegram.setWebhook(url)
            debug(
                'Bot @' +
                    username +
                    ' started using a webhook at ' +
                    new Date() +
                    ' for URL ' +
                    url
            )
        }
    }

    private registerListeners(): void {
        // Group support
        this.bot.on(['new_chat_members'], groups.addedToGroup)
        this.bot.on(['left_chat_member'], groups.removedFromGroup)

        // Special handling for photos as they don't simply have a file_id
        this.bot.on(['photo'], files.handlePhoto)

        // Files
        this.bot.on(
            ['audio', 'document', 'sticker', 'video', 'voice', 'video_note'],
            files.handleDocument
        )

        // Commands
        this.bot.command('start', commands.start)
        this.bot.command('help', commands.help)
        this.bot.command('cancel', commands.cancel)
        this.bot.command('reset', commands.reset)
        this.bot.command('balance', commands.balance)
        this.bot.command(
            ['contribute', 'the_more_the_merrier'],
            commands.contribute
        )
        this.bot.command('feedback', commands.feedback)
        this.bot.command('limitations', commands.limitations)
        this.bot.command('apikey', commands.apiKey)
        this.bot.command('language', commands.language)
        this.bot.command('info', commands.info)
        this.bot.command('convert', commands.convert)

        // Text messages are used for every file format command (like /mp4) and when providing an API key
        this.bot.on(
            ['text'],
            files.handleTextMessage,
            apiKeys.handleTextMessage,
            fallbacks.help
        )

        // Respond to callback queries
        this.bot.on('callback_query', callbacks.handleCallbackQuery)

        // Log all errors to dedicated channel
        this.bot.catch((err: any, ctx: TaskContext) => this.report(err, ctx))
    }

    private report(err: any, ctx: TaskContext): void {
        if (adminId !== undefined) {
            // <- the dev's debug log channel id
            const log =
                'Error:\n' +
                JSON.stringify(err, null, 2) +
                '\n\nContext:\n' +
                JSON.stringify(
                    { ...ctx.message, ...ctx.session, ...ctx.command },
                    null,
                    2
                ) +
                '\n\nTrace:\n' +
                (err?.stack === undefined ? new Error() : err).stack
            this.bot.telegram.sendMessage(adminId, log)
            if (this.bot.context.botInfo.isDevBot) {
                debug(log)
            }
        }
    }
}
