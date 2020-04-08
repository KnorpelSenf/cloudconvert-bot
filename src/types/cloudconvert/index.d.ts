declare module 'cloudconvert' {
    import { ReadStream, WriteStream } from 'fs'

    export default class Api {
        constructor(apiKey: string)
        /**
         * createProcess
         */
        public createProcess: (
            parameters: ProcessCreateParamters,
            callback?: ProcessCallback
        ) => Process
        public convert: (
            parameters: ProcessStartParameters,
            callback?: ProcessCallback
        ) => Process
    }
    export class Process {
        data: ProcessData
        constructor(api: Api, url?: string)
        create: (
            parameters: ProcessCreateParamters,
            callback?: ProcessCallback
        ) => this
        start: (
            parameters: ProcessStartParameters,
            callback?: ProcessCallback
        ) => this
        refresh: (parameters?: void, callback?: ProcessCallback) => this
        upload: (
            source: ReadStream,
            filename?: string,
            callback?: ProcessCallback
        ) => this
        wait: (callback?: ProcessCallback, interval?: number) => this
        delete: (parameters?: void, callback?: ProcessCallback) => this
        download: (
            destination: WriteStream,
            remotefile?: string,
            callback?: ProcessCallback,
            pipeoptions?: { end?: boolean }
        ) => this
        pipe: (
            destination: WriteStream,
            options?: { end?: boolean }
        ) => WriteStream
        downloadAll: (outputpath: string, callback: ProcessCallback) => this
    }

    export interface ProcessData {
        id?: string
        url?: string
        percent?: number
        message?: string
        step?: Step
        starttime?: number
        expire?: number
        input?: any
        converter?: any
        info?: any
    }
    export type Step =
        | 'input'
        | 'wait'
        | 'convert'
        | 'output'
        | 'error'
        | 'finished'

    export interface ProcessCreateParamters {
        inputformat: string
        outputformat: string
        mode?: Mode
    }

    export type ProcessStartParameters = InputParameters &
        ConversionParameters &
        OutputParameters

    export interface InputDownload {
        input: 'download'
        file: string
    }
    export interface InputUpload {
        input: 'upload'
    }
    export interface InputRawBase64 {
        input: 'raw' | 'base64'
        file: string
        filename: string
    }
    export interface InputCloud {
        input: {
            // TODO: specify input types
            s3?: any
            openstack?: any
            azurefile?: any
            googlecloud?: any
            ftp?: any
        }
        file: string
        outputformat: string
        output: {
            // TODO: specify output types
            s3?: any
            openstack?: any
            azurefile?: any
            googlecloud?: any
            ftp?: any
        }
    }
    export type InputParameters =
        | InputDownload
        | InputUpload
        | InputRawBase64
        | InputCloud

    export interface ConversionParameters {
        outputformat?: string
        converteroptions?: any // TODO: specify possible values
        mode?: Mode
        timeout?: number
    }

    export interface OutputParameters {
        email?: boolean
        output?: Storage
        callback?: string
        wait?: boolean
        download?: boolean
        save?: boolean
    }

    export type Storage =
        | 'dropbox'
        | 'googledrive'
        | 's3'
        | 'openstack'
        | 'azure'
        | 'googlecloud'
        | 'ftp'
    export type Mode = 'convert' | 'info' | 'combine' | 'archive' | 'extract'

    export type ProcessCallback = (err: Error, process: Process) => any
}
