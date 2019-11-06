import d from 'debug';
import * as strings from '../../strings';
import TaskContext from '../models/task-context';
const debug = d('bot:contr:cb');

export async function help(ctx: TaskContext) {
    if (ctx.message?.chat.type === 'private') {
        await ctx.reply(strings.helpmsgText);
    }
}
