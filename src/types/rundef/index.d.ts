declare module 'rundef' {

    export default function removeUndefinedProperties<T>(obj: T, mutate?: boolean, recursive?: number | boolean): T;

}
