import { Chat } from 'telegram-typings';
import { FileConversion } from './file-conversion';

export default interface Task {
    chat: Chat;
    task: FileTask;
    api_key?: string;
    auto: [FileConversion];
}

export interface FileTask {
    file_id?: string;
    target_format?: string;
    file_name?: string;
}
