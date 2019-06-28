Promise.resolve(3).then(v => {
    if (v == 3)
        throw 'oops! 3'
    else
        return Promise.resolve(v)
}).catch(err => {
    console.log('caught.')
    return 2
}).then(v => {
    console.log('value is ' + v)
});