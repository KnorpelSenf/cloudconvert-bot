import { UpdateWriteOpResult } from 'mongodb';
import { ContextMessageUpdate } from 'telegraf';
import I18n from 'telegraf-i18n';
import { Chat } from 'telegram-typings';
import { AutoFileConversion } from './file-conversion';
import Task from './task';

export default interface TaskContext extends ContextMessageUpdate {
    state: {
        bot_info: BotInfo;
        // Set by command-args middleware:
        command?: {
            raw: string;
            command: string;
            args: string[];
        }
    };
    db: ChatManager & TaskManager & ApiKeyManager;
    i18n: I18n;
}

export type ChatKey = Chat | number;

export interface ChatManager {
    registerChat: (chat: ChatKey, apiKey?: string) => Promise<void>;

    resetChat: (chat: ChatKey) => Promise<void>;

    unregisterChat: (chat: ChatKey) => Promise<void>;
}

export interface TaskManager {
    getKey: (chat: ChatKey) => Promise<string | undefined>;

    getTaskInformation: (chat: ChatKey) => Promise<Partial<Task>>;

    updateTaskInformation: (chat: ChatKey, update: any) => Promise<UpdateWriteOpResult>;

    clearTask: (chat: ChatKey) => Promise<void>;

    logConversionPerformed: (chat: ChatKey, conversion: AutoFileConversion) => Promise<void>;
}

export interface ApiKeyManager {
    saveApiKey: (chat: ChatKey, key: string) => Promise<void>;
}
