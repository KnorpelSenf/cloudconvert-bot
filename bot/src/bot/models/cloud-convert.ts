import axios from 'axios'
import CloudConvert, { Process, ProcessData } from 'cloudconvert'
import d from 'debug'
import {
    Array,
    Literal,
    Null,
    Number,
    Record,
    Static,
    String,
    Undefined,
    Union,
} from 'runtypes'
import * as util from '../helpers/get-file-extension'
import TaskContext from './task-context'
import { PassThroughStream } from './pass-through-stream'
const debug = d('bot:converter')

const UserType = Record({
    user: Union(String, Null), // Null iff shared account (that's the dev's personal account)
    minutes: Number,
    output: Array(
        Union(
            Literal('googledrive'),
            Literal('dropbox'),
            Literal('box'),
            Literal('onedrive')
        )
    ).Or(Undefined),
})
type User = Static<typeof UserType>

const FormatType = Record({
    inputformat: String,
    outputformat: String,
    group: String,
})
type Format = Static<typeof FormatType>

const REFRESH_INTERVAL = 100 // ms

if (process.env.CLOUD_CONVERT_API_TOKEN === undefined) {
    throw new Error(
        'Please provide a cloudconvert API token in the environment variable CLOUD_CONVERT_API_TOKEN!'
    )
}
const ccDefault = new CloudConvert(process.env.CLOUD_CONVERT_API_TOKEN)

async function getDefaultUser(): Promise<User> {
    const response = await axios.get(
        'https://api.cloudconvert.com/v1/user?apikey=' +
            process.env.CLOUD_CONVERT_API_TOKEN
    )
    const defaultUser = UserType.check(response.data)
    return {
        user: null,
        minutes: defaultUser.minutes,
        output: [],
    }
}

async function getNonDefaultUser(key: string): Promise<User | undefined> {
    try {
        debug('Performing request')
        const response = await axios.get(
            'https://api.cloudconvert.com/v1/user?apikey=' + key
        )
        debug('Response is:')
        debug(response.data)
        return UserType.check(response.data)
    } catch (e) {
        d('err')(e)
        return undefined
    }
}

export async function validateApiKey(key: string): Promise<string | undefined> {
    debug('Getting non-default user')
    const user = await getNonDefaultUser(key)
    // Three options:           invalid      valid        shared key
    return user === undefined ? undefined : user.user || undefined
}

/**
 * Returns a User object for the given API key of a cloud convert account.
 * If no key is given, the default account is used. If the key is invalid,
 * another request will be performed and the default account's balance will be returned instead.
 */
async function getUser(key?: string): Promise<User> {
    return key === undefined
        ? await getDefaultUser()
        : (await getNonDefaultUser(key)) || (await getDefaultUser())
}

/**
 * Return the number of conversion minutes for the account as specified by getUser.
 * @param key cloud convert account API key
 */
export async function getBalance(key?: string): Promise<number> {
    const user = await getUser(key)
    return user.minutes
}

function getCloudConvert(key?: string): CloudConvert {
    return key === undefined ? ccDefault : new CloudConvert(key)
}

// The following functions are so freaking ugly.
// TODO: Upgrade to cloudconvert v2 once it's stable
// https://cloudconvert.com/blog/api-v2

// We cannot use `util.promisify` due to the missing context.
// Use this helper function (instead of adding bluebird as a dependency).
function promiseResolver<T>(
    resolve: (value?: T | PromiseLike<T> | undefined) => void,
    reject: (reason?: any) => void
): (err: Error, t: T) => void {
    return (err: Error, t: T) => {
        if (err) {
            reject(err)
        } else {
            resolve(t)
        }
    }
}

export async function getFileInfo(
    fileUrl: string,
    key?: string
): Promise<ProcessData | undefined> {
    const ext = util.ext(fileUrl)
    const cc = getCloudConvert(key)

    let p: Process = await new Promise((resolve, reject) => {
        cc.createProcess(
            {
                inputformat: ext,
                outputformat: ext,
                mode: 'info',
            },
            promiseResolver(resolve, reject)
        )
    })
    p = await new Promise((resolve, reject) => {
        p.start(
            {
                input: 'download',
                file: fileUrl,
                mode: 'info',
            },
            promiseResolver(resolve, reject)
        )
    })
    const result: any = await new Promise((resolve, reject) => {
        p.wait(promiseResolver(resolve, reject), REFRESH_INTERVAL)
    })
    return result === undefined ? undefined : result.data
}

export async function listPossibleConversions(ext: string): Promise<Format[]> {
    const response = await axios.get(
        'https://api.cloudconvert.com/conversiontypes?inputformat=' + ext
    )
    return Array(FormatType).check(response.data)
}

export async function convertFile(
    fileUrl: string,
    outputformat: string,
    fileName: string,
    key?: string
): Promise<NodeJS.ReadableStream> {
    const inputformat = util.ext(fileUrl)
    const cc = getCloudConvert(key)

    let p: Process = await new Promise((resolve, reject) => {
        cc.createProcess(
            {
                inputformat,
                outputformat,
            },
            promiseResolver(resolve, reject)
        )
    })
    p = await new Promise((resolve, reject) => {
        p.start(
            {
                input: 'download',
                file: fileUrl,
                outputformat,
            },
            promiseResolver(resolve, reject)
        )
    })
    p = await new Promise((resolve, reject) => {
        // The following line is one of the reasons why using the cloudconvert api
        // is so ugly in v1. The callback is not the last parameter. This is against
        // the convention. As a result, we cannot promisify the function.
        // Instead, we have to use this weird way to wrap all functions
        // in order to be able to use some proper async/await. Thanks.
        p.wait(promiseResolver(resolve, reject), REFRESH_INTERVAL)
    })

    const stream = new PassThroughStream(fileName)
    p.download(stream)
    stream.on('finish', () => {
        p.delete()
    })
    return stream
}

export function describeErrorCode(
    ctx: TaskContext,
    err: Error & { code: number }
): string {
    debug(err)
    switch (err.code) {
        case 400:
            return err.message
        case 402:
            return ctx.i18n.t('noMoreConversionMinutes')
        default:
            if (err.message) {
                return err.message
            } else {
                d('err')("ERROR'S STACK AND CURRENT STACK:")
                d('err')(err.stack)
                d('err')(new Error().stack)
                return ctx.i18n.t('unknownError')
            }
    }
}
