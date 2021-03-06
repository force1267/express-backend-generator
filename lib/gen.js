const fs = require('fs')
const path = require('path')


function generate(model, dir) {
    function mkdir(name) {
        fs.mkdirSync(path.join(dir, name))
    }
    function write(file, content) {
        fs.writeFileSync(path.join(dir, file), content)
    }

    // preprocess users type
    let usersModel = {
        name: "users",
        fields: {
            email: {
                name: "email",
                type: "string",
                options: { unique: true, private: true }
            },
            phone: {
                name: "phone",
                type: "string",
                options: { unique: true, private: true }
            },
            role: {
                name: "role",
                type: "role",
                options: { required: true, default: "public" }
            },
            password: {
                name: "password",
                type: "password",
                options: { private: true }
            }
        }
    }
    if (!model.users) {
        model.users = usersModel
    } else {
        for (let fieldName in usersModel) {
            model.users[fieldName] = usersModel[fieldName]
        }
    }

    // preprocess relations
    for (let colName in model) {
        let col = model[colName]
        for (let fieldName in col.fields) {
            let field = col.fields[fieldName]
            if (!field.options) {
                field.options = {}
            }
            if (['user', 'relation'].includes(field.type) && !field.options.generated) {
                let opts = field.options
                let relType = ''
                if (opts['one-to-one']) {
                    relType = 'one-to-one'
                } else if (opts['one-to-many']) {
                    relType = 'one-to-many'
                } else if (opts['many-to-one']) {
                    relType = 'many-to-one'
                } else if (opts['many-to-many']) {
                    relType = 'many-to-many'
                } else {
                    relType = 'simple'
                }
                if (field.type === "relation" && opts.with) {
                    if (!model[opts.with]) {
                        let err = new Error(`field '${colName}.${fieldName}' is relation with '${opts.with}' collection which doesn't exist.`)
                        throw err;
                    }
                } else if (field.type !== 'user') {
                    let err = new Error(`field '${colName}.${fieldName}' is relation but 'with=' tag is not set.`)
                    throw err;
                }
                if (relType !== 'simple') {
                    // a field in the related collection is needed
                    if (!opts.named) {
                        let err = new Error(`field '${colName}.${fieldName}' is '${relType}' relation with '${opts.with || 'users'}' collection but 'named=' tag is not set.`)
                        throw err;
                    } else if (field.type === 'user' && model[opts.with || 'users'][opts.named]) {
                        let err = new Error(`field '${colName}.${fieldName}' is relation with '${opts.with || 'users'}' 'named=${opts.name}' which exists on '${opts.with || 'users'}' collection.`)
                        throw err;
                    } else {
                        let rel = model[opts.with || 'users']
                        let relField = rel.fields[opts.named] = {
                            name: opts.named,
                            type: 'relation',
                            options: {
                                generated: true, // note that we generated this
                                with: colName,
                                named: fieldName,
                                [relType.split('-').reverse().join('-')]: true
                            }
                        }
                        if (opts.dependent) {
                            relField.dependency = true
                        }
                        if (opts.dependency) {
                            relField.dependent = true
                        }
                        if (opts.private) {
                            relField.private = true
                        }
                    }
                }
            }
        }
    }

    // console.log(__dirname)
    console.log('generating')
    console.log(dir)
    // console.log(model)

    // generate package.json for `yarn install`ing dependencies
    write('package.json',
        `{
    "dependencies": {
        "express": "^4.17.1",
        "body-parser": "^1.19.0",
        "helmet": "^4.4.1",
        "mongoose": "^5.11.18"
    }
}`)

    // generating the entry
    write('index.js',
        `const express = require('express')
const body = require('body-parser')
const helmet = require('helmet')

const path = require('path')

const app = express()
app.use(helmet())
app.use(body.json())

const auth = require('./lib/auth')()
auth.provider('local', require('./lib/auth-local'))
auth.provider('google', require('./lib/auth-google'))

app.use(auth.handler)
app.use('/auth', auth)


${(e => { // routes
            let reqs = ''
            for (let col in model) {
                reqs += `const ${col}Router = require('./routes/${col}.js')\n`
            }
            let routes = ''
            for (let col in model) {
                routes += `app.use('/${col}', ${col}Router)\n`
            }
            return reqs + '\n' + routes
        })()}

app.use('/', express.static(path.join(__dirname, 'public')))

const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/jsgen', { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    console.log('connected to database')
    app.listen(8080)
    console.log('serving on http://localhost:8080')
});
`)

    // generate mongoose schemas and models
    mkdir('models')
    write('models/model.json', JSON.stringify(model))
    for (let col in model) {
        write(`models/${col}.js`,
            `const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types

const ${col}Schema = new mongoose.Schema({
${(e => {
                // generate types in schema
                let fstr = ''
                let fields = model[col].fields
                let keys = Object.keys(fields)
                let last = keys[keys.length - 1]
                for (let name of keys) {
                    const { type, options: opts } = fields[name]
                    let t;
                    // get type names
                    if (['number', 'string', 'boolean', 'date'].includes(type)) {
                        t = type[0].toUpperCase() + type.slice(1)
                    } else if (type === 'any') {
                        t = '{}' // mixed, any
                    } else if (['time', 'datetime'].includes(type)) {
                        t = 'Date'
                    } else if (['password', 'article', 'file', 'location', 'role'].includes(type)) {
                        t = 'String'
                    } else if (['user', 'relation'].includes(type)) {
                        t = 'ObjectId'
                    }
                    // make array type
                    if (opts.list || opts['many-to-one'] || opts['many-to-many']) {
                        if (type !== 'any') {
                            t = `[${t}]`
                        } else {
                            t = '[]'
                        }
                    }

                    // add options object instead of type string if option have something given
                    // this loop checks if there exist one of these tags
                    // replace {...} with type string and then break
                    // this loop is not redundant
                    for (let opt of [
                        'required',
                        'index',
                        'unique',
                        'min',
                        'max',
                        'enum',
                        'default',
                        // 'populate',// doesn't make a diffrence in mongoose schema. handled elsewhere
                        'match',
                        'trim',
                        'uppercase',
                        'lowercase',
                    ]) {
                        if (opt in opts || ['user', 'relation'].includes(type)) {
                            if (['user', 'relation'].includes(type)) {
                                let tmp = `{`
                                // make the comment
                                let pre = ''
                                if (opts['one-to-one']) {
                                    pre = ' one-to-one'
                                } else if (opts['one-to-many']) {
                                    pre = ' one-to-many'
                                } else if (opts['many-to-one']) {
                                    pre = ' many-to-one'
                                } else if (opts['many-to-many']) {
                                    pre = ' many-to-many'
                                }
                                tmp += ` //${pre} relation with ${opts.with || 'users'}`
                                if (pre) {
                                    tmp += ` (${opts.with || 'users'}.${opts.named ? opts.named : col + '_' + name})`
                                }
                                t = `${tmp}\n\t\ttype: ${t},\n\t\tref: '${opts.with || 'users'}',\n`
                            } else if (['password', 'article', 'file', 'location', 'role'].includes(type)) {
                                // the real type commented
                                t = `{\n\t\ttype: ${t}, // ${type}\n`
                            } else {
                                // no comment needed
                                t = `{\n\t\ttype: ${t},\n`
                            }
                            // add mongoose schema type options
                            if ('required' in opts) {
                                t += `\t\trequired: true,\n`
                            }
                            if ('index' in opts) {
                                t += `\t\tindex: true,\n`
                            }
                            if ('unique' in opts) {
                                t += `\t\tunique: true,\n`
                            }
                            if ('min' in opts) {
                                if (type === 'string') {
                                    t += `\t\tminLength: ${opts.min},\n`
                                } else if (type === 'number') {
                                    t += `\t\tmin: ${opts.min},\n`
                                } else if (['date', 'time', 'datetime'].includes(type)) {
                                    t += `\t\tmin: new Date('${opts.min}'),\n`
                                }
                            }
                            if ('max' in opts) {
                                if (type === 'string') {
                                    t += `\t\tmaxLength: ${opts.max},\n`
                                } else if (type === 'number') {
                                    t += `\t\tmax: ${opts.max},\n`
                                } else if (['date', 'time', 'datetime'].includes(type)) {
                                    t += `\t\tmax: new Date('${opts.max}'),\n`
                                }
                            }
                            if ('default' in opts) {
                                if (type === 'number') {
                                    t += `\t\tdefault: ${opts.default},\n`
                                } else if (['date', 'time', 'datetime'].includes(type)) {
                                    t += `\t\tdefault: new Date('${opts.default}'),\n`
                                } else {
                                    t += `\t\tdefault: '${opts.default}',\n`
                                }
                            }
                            if ('enum' in opts) {
                                t += `\t\tenum: [${opts.enum.split(' ').join('').split(',').map(s => `'${s}'`).join(', ')}],\n`
                            }
                            if ('match' in opts) {
                                t += `\t\tmatch: /${opts.match}/,\n`
                            }
                            if ('trim' in opts) {
                                t += `\t\ttrim: true,\n`
                            }
                            if ('uppercase' in opts) {
                                t += `\t\tuppercase: true,\n`
                            }
                            if ('lowercase' in opts) {
                                t += `\t\tlowercase: true,\n`
                            }
                            t += '\t}'
                            break
                        }
                    }
                    fstr += `\t${name}: ${t},`
                    if (name !== last) {
                        fstr += '\n'
                    }
                }
                return fstr
            })()}
})
const ${col} = mongoose.model('${col}', ${col}Schema)

module.exports = { ${col}, ${col}Schema }`)
    }

    // generate express routes controlling models
    // TODO investigate doc.markModified('dueDate'); use when updating date ?
    mkdir('routes')
    for (let col in model) {
        let fields = model[col].fields
        let keys = Object.keys(fields)

        write(`routes/${col}.js`,
            `const { Router } = require('express')
const route = Router()

const {
    ${col}: model,
    ${col}Schema: schema
} = require('../models/${col}.js')

// generates standard response
const response = require('../lib/response.js')
// populates req.mquery (mongoose compatible query)
// do not add private fields
const queryMaker = require('../lib/query-maker.js')
const query = queryMaker([\n\t${keys.
                filter(k => !fields[k].options.private). // not letting to query private fields
                map(k => `'${k}'`).
                join(',\n\t').
                toString()
            }\n])

// get array of entries
route.get('/', query, (req, res) => {
    let query = model.find(req.mquery)

    // query modifiers
    const { sort, skip, limit, populate } = req.query
    if(sort) {
        query = query.sort(sort) // asc, desc, ascending, descending, 1, -1
    }
    if(limit) {
        query = query.limit(parseInt(limit))
    }
    if(skip) {
        query = query.skip(parseInt(skip))
    }
${(() => {
                let pops = keys.
                    map(k => fields[k]).
                    filter(f => f.options.populate).
                    map(f => `populate("${f.name}")`).
                    join(".\n\t\t")
                if (pops.length > 0) {
                    return `\tif(!["false", "0", "no"].includes(populate)) {\n\t\tquery = query.\n\t\t${pops}\n\t}`
                } else {
                    return ""
                }
            })()}
    query.exec((err, data) => {
        // delete unwanted or private fields here
${keys.
                map(k => fields[k]).
                filter(f => f.options.private).
                map(f => `\t\tdelete data.${f.name}\n`).
                join('')
            }
        return res.json({ err, data })
    })
})

// creates an entry
route.post('/', (req, res) => {
    // modify req.body to limit the fields here

    let entry = new model(req.body)
    // entry.created_by = req.user._id

    entry.save().then((data) => {
${keys.
                map(k => fields[k]).
                filter(f => f.options.private).
                map(f => `\t\tdelete data.${f.name}\n`).
                join('')
            }
        return res.json({ err: null, data })
    }).catch(err => {
        return res.json({ err })
    })
})

// update or overwrite array of entries
route.put('/', query, (req, res) => {
    let query = model.updateMany(req.mquery, req.body)
    query.exec((err, result) => {
        return res.json({ err, result })
    })
})

// delete an array of entries
route.delete('/', query, (req, res) => {
    let query = model.deleteMany(req.mquery)
    query.exec((err, result) => {
        return res.json({ err, result })
    })
})

// get an entry by id
route.get('/:id', (req, res) => {
    let { id } = req.params
    model.findById(id).exec((err, data) => {
        return res.json({ err, data })
    })
})

// update or overwrite an entry by id
route.put('/:id', (req, res) => {
    let { id } = req.params
    model.findByIdAndUpdate(id, req.body, { new: true }).exec((err, result) => {
        return res.json({ err, result })
    })
})

// delete an entry by id
route.delete('/:id', (req, res) => {
    let { id } = req.params
    model.findByIdAndDelete(id).exec((err, data, result) => {
        return res.json({ err, data, result })
    })
})

module.exports = route`)
    }

    // generate utility functions and middlewares
    mkdir('lib')
    write('lib/response.js', `
module.exports = function Response(err = null, data = null) {
    return { err, data }
}`)
    write('lib/query-maker.js',
        `// q: express req.query, fileds: [String]

const availableOperators = [
    "gt",
    "gte",
    "lt",
    "lte",
    "ne",
    "in",
    "nin",
    "exists"
]

module.exports = function (fields = null) {
    if(fields && fields.length > 0) {
        return function maker(req, res, next) {
            let { query } = req
            let q = {}
            for(let key in query) {
                let val = query[key]
                let fop = key.split('_')
                if(fop.length < 3) {
                    let field = fop[0]
                    let op = fop[1]
                    if(fields.includes(field)) {
                        if(op) {
                            if(availableOperators.includes(op)) {
                                let f = q[field] = q[field] || {}
                                f[\`$\${op}\`] = op.endsWith("in") ? val.split(',') : val
                            }
                        } else {
                            q[field] = val
                        }
                    }
                } 
            }
            req.mquery = q
            return next()
        }
    } else {
        return function maker(req, res, next) {
            let { query } = req
            let q = {}
            for(let key in query) {
                let val = query[key]
                let fop = key.split('_')
                if(fop.length < 3) {
                    let field = fop[0]
                    let op = fop[1]
                    if(op) {
                        if(availableOperators.includes(op)) {
                            let f = q[field] = q[field] || {}
                            f[\`$\${op}\`] = op.endsWith("in") ? val.split(',') : val
                        }
                    } else {
                        q[field] = val
                    }
                } 
            }
            req.mquery = q
            return next()
        }
    }
}`)
    write('lib/hash.js', `
var crypto = require('crypto')

// larger numbers mean better security, less
var config = {
    // size of the generated hash
    hashBytes: 32,
    // larger salt means hashed passwords are more resistant to rainbow table, but
    // you get diminishing returns pretty fast
    saltBytes: 16,
    // more iterations means an attacker has to take longer to brute force an
    // individual password, so larger is better. however, larger also means longer
    // to hash the password. tune so that hashing the password takes about a
    // second
    iterations: 872791
}

/**
 * Hash a password using Node's asynchronous pbkdf2 (key derivation) function.
 *
 * Returns a self-contained buffer which can be arbitrarily encoded for storage
 * that contains all the data needed to verify a password.
 *
 * @param {!String} password
 * @param {!function(?Error, ?Buffer=)} callback
 */
async function hash(password) {
    return await new Promise((resolve, reject) => {
        // generate a salt for pbkdf2
        crypto.randomBytes(config.saltBytes, function (err, salt) {
            if (err) {
                return reject(err)
            }

            crypto.pbkdf2(password, salt, config.iterations, config.hashBytes, function (err, dkey) {

                    if (err) {
                        return reject(err)
                    }

                    var combined = Buffer.alloc(dkey.length + salt.length + 8)

                    // include the size of the salt so that we can, during verification,
                    // figure out how much of the dkey is salt
                    combined.writeUInt32BE(salt.length, 0, true)
                    // similarly, include the iteration count
                    combined.writeUInt32BE(config.iterations, 4, true)

                    salt.copy(combined, 8)
                    dkey.copy(combined, salt.length + 8)
                    return resolve(combined)
                })
        })

    })
}

/**
 * Verify a password using Node's asynchronous pbkdf2 (key derivation) function.
 *
 * Accepts a hash and salt generated by hash, and returns whether the
 * hash matched the password (as a boolean).
 *
 * @param {!String} password
 * @param {!Buffer} combined Buffer containing hash and salt as generated by
 *   hash.
 * @param {!function(?Error, !boolean)}
 */
async function verify(password, combined) {
    return await new Promise((resolve, reject) => {
        // extract the salt and hash from the combined buffer
        var saltBytes = combined.readUInt32BE(0)
        var hashBytes = combined.length - saltBytes - 8
        var iterations = combined.readUInt32BE(4)
        var salt = combined.slice(8, saltBytes + 8)
        var hash = combined.toString('binary', saltBytes + 8)

        // verify the salt and hash against the password
        crypto.pbkdf2(password, salt, iterations, hashBytes, function (err, dkey) {
            if (err) {
                return reject(err)
            }

            return resolve(dkey.toString('binary') === hash)
        })
    })
}

exports.hash = hash
exports.verify = verify`)
    write('lib/auth.js', `
const { Router } = require('express')

module.exports = () => {
    const auth = Router()
    const middlewares = {}

    // add a provider 
    auth.provider = function useProvider(name, provider) {
        const mount = {}
        // list of middlewares
        const mids = middlewares[name] = []

        for(const method of ['get', 'post', 'put', 'delete', 'all']) {
            mount[method] = (sub, handler) => { auth[method](('/' + name + sub).split('//').join('/'), handler) }
        }
        mount.use = middleware => mids.push(middleware)
        provider(mount)
    }

    // populates req.user
    auth.handler = function handler(req, res, next) {
        // handle JWT, Cookie, header, ...
        let provider = req.query.provider // || req.headers['provider'] || req.cookies['provider'] || req.jwt.provider

        // if no provider found use the first registered provider
        let mids = middlewares[provider] || Object.values(middlewares)[0]
        if(!mids) {
            // if provider is not there, be graceful, no error
            req.user = null
            return next()
        }

        for(let mid of mids) {
            let done = false
            mid(req, res, () => done = true)
            if(!done) {
                return false
            }
        }

        return next()
    }

    return auth
}`)
    write('lib/auth-local.js', `
const { hash, verify } = require('./hash.js');
const {
    users: model,
    usersSchema: schema
} = require('../models/users.js')

module.exports = function localProvider(provider) {
    // these middlewares are used when this provider is used for auth
    provider.use((req, res, next) => {
        // populate req.user here
        req.user = { id: 0 }
        return next()
    })

    provider.use((req, res, next) => {
        // populate req.user here
        req.user.name = 'John'
        return next()
    })

    provider.get('/me', (req, res) => {
        // send user info
        return res.json(req.user)
    })
    provider.post('/register', (req, res) => {
        // register a user
    })
    provider.post('/login', (req, res) => {
        // login
    })
}`)
    write('lib/auth-google.js', `
const { hash, verify } = require('./hash.js');
const {
    users: model,
    usersSchema: schema
} = require('../models/users.js')

module.exports = function googleProvider(provider) {
    // these middlewares are used when this provider is used for auth
    provider.use((req, res, next) => {
        // populate req.user here
        req.user = { id: 1 }
        return next()
    })

    provider.use((req, res, next) => {
        // populate req.user here
        req.user.name = 'Johnny'
        return next()
    })

    provider.get('/me', (req, res) => {
        // send user info
        return res.json(req.user)
    })
    provider.post('/register', (req, res) => {
        // register a user
    })
    provider.post('/login', (req, res) => {
        // login
    })
}`)
    // generate test html page and client-side js handler for routes
    mkdir('public')
    write('public/index.html',
        `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modeler</title>
</head>
<body>
<h2>It Works !</h2>
</body>
</html>`)
    write('public/controller.js',
        `// todo
`)
}

module.exports = generate
// test> node lib/gen/index.js model.json ./build
// try {
//     fs.mkdirSync(path.join(__dirname, "../", process.argv[3]))
// } catch (err) {
//     fs.rmdirSync(path.join(__dirname, "../", process.argv[3]), { recursive: true, force: true })
//     fs.mkdirSync(path.join(__dirname, "../", process.argv[3]))
// }
// generate (
//     JSON.parse(
//         fs.readFileSync(process.argv[2]).toString()
//     ),
//     path.join(__dirname, "../", process.argv[3])
// )