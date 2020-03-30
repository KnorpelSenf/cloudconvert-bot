import type { Firestore } from '@google-cloud/firestore';
import type { ContextMessageUpdate } from 'telegraf';
import type I18n from 'telegraf-i18n';
import type { BotInfo } from '../bot';
import type { FileConversion } from './file-conversion';

export default interface TaskContext extends ContextMessageUpdate {
    // Set upon initialization
    bot_info: BotInfo;
    // Set by command-args middleware:
    command?: {
        raw: string;
        command: string;
        args: string[];
    };
    // Session read from firebase
    session: SessionData;
    // Database
    db: Firestore;
    // I18n object permitting access to localized strings
    i18n: I18n;
}

export interface SessionData {
    task?: FileTask;
    api_key?: string;
    auto?: FileConversion[];
}

export interface FileTask {
    file_id?: string;
    target_format?: string;
    file_name?: string;
}
