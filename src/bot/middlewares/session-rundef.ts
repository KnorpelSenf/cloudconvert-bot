import d from 'debug';
import rundef from 'rundef';
import { Middleware } from 'telegraf';
import TaskContext from '../models/task-context';
const debug = d('bot:mw:rundef');

export default (): Middleware<TaskContext> => async (ctx, next) => {
    const r = await next?.();
    rundef(ctx.session, true, true);
    return r;
};
