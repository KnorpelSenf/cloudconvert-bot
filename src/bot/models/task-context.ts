import { UpdateWriteOpResult } from 'mongodb';
import { ContextMessageUpdate } from 'telegraf';
import { Chat } from 'telegram-typings';
import { BotInfo } from '../bot';
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
}

export type ChatKey = Chat | number;

export interface ChatManager {
    registerChat: (chat: ChatKey, apiKey?: string) => Promise<void>;

    unregisterChat: (chat: ChatKey) => Promise<void>;
}

export interface TaskManager {
    getKey: (chat: ChatKey) => Promise<string | undefined>;

    getTaskInformation: (chat: ChatKey) => Promise<Partial<Task>>;

    updateTaskInformation: (chat: ChatKey, update: any) => Promise<UpdateWriteOpResult>;

    clearTask: (chat: ChatKey) => Promise<void>;
}

export interface ApiKeyManager {
    saveApiKey: (chat: ChatKey, key: string) => Promise<void>;
}
