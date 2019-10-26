import { Chat } from 'telegram-typings';
import { FileConversion } from './file-conversion';

export default interface Task {
    chat: Chat;
    task: {
        file_id?: string;
        target_format?: string;
    };
    api_key?: string;
    auto: [FileConversion];
}
