import { Boolean, Record, Static, String } from 'runtypes'

export const FileConversionType = Record({
    from: String,
    to: String,
})
export type FileConversion = Static<typeof FileConversionType>

export const AutoFileConversionType = FileConversionType.And(
    Record({
        auto: Boolean,
    })
)
export type AutoFileConversion = Static<typeof AutoFileConversionType>
