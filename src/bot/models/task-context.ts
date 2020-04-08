import type { Firestore } from '@google-cloud/firestore'
import type { ContextMessageUpdate } from 'telegraf'
import type I18n from 'telegraf-i18n'
import type { BotInfo } from '../bot'
import type { FileConversion } from './file-conversion'

export default interface TaskContext extends ContextMessageUpdate {
    // Set upon initialization
    botInfo: BotInfo
    // Set by command-args middleware:
    command?: {
        raw: string
        command: string
        args: string[]
    }
    // Session read from firebase
    session: Promise<SessionData> | SessionData
    // Database
    db: Firestore
    // I18nContext object permitting access to localized strings (the lib is missing types)
    i18n: Pick<I18n, 'locale' | 't'>
    supportedLanguages: Array<{ name: string; locale: string }>
}

export interface SessionData {
    task?: FileTask
    api_key?: string
    auto?: FileConversion[]
}

export interface FileTask {
    file_id?: string
    target_format?: string
    file_name?: string
}
