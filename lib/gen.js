const fs = require('fs')
const path = require('path')


function generate(model, dir) {
    function mkdir(name) {
        fs.mkdirSync(path.join(dir, name))
    }
    function write(file, content) {
        fs.writeFileSync(path.join(dir, file), content)
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

// app.use(auth)

${(e => { // routes
    let reqs = ''
    for(let col in model) {
        reqs += `const ${col}Router = require('./routes/${col}.js')\n`
    }
    let routes = ''
    for(let col in model) {
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
    for(let col in model) {
        write(`models/${col}.js`,
`const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types

const ${col}Schema = new mongoose.Schema({
${(e => { // fields
// Any
// Number
// String
// Boolean
// Date
// Time
// DateTime
// Password
// Article
// File
// Location
// User
// Role
// Relation
// doc.markModified('dueDate'); todo use when updating date
    function compileFieldType(type, opts) {
        let t;
        // get type names
        if(['number', 'string', 'boolean', 'date'].includes(type)) {
            t = type[0].toUpperCase() + type.slice(1)
        } else if(type === 'any') {
            t = '{}' // mixed, any
        } else if(['time', 'datetime'].includes(type)) {
            t = 'Date'
        } else if(['password', 'article', 'file', 'location', 'role'].includes(type)) {
            t = 'String'
        } else if(['user', 'relation'].includes(type)) {
            t = 'ObjectId'
        }
        // make array type
        if(opts.list || opts['many-to-one'] || opts['many-to-many']) {
            if(type !== 'any') {
                t = `[${t}]`
            } else {
                t = '[]'
            }
        }

        // add options if given
        for(let opt of [
            'required',
            'index',
            'unique',
            'min',
            'max',
            'enum',
            'default',
            'populate',
            'match',
            'trim',
            'uppercase',
            'lowercase',
        ]) {
            if(opt in opts) {
                t = `{\n\t\ttype: ${t},\n`
                if('required' in opts) {
                    t += `\t\trequired: true,\n`
                }
                if('index' in opts) {
                    t += `\t\tindex: true,\n`
                }
                if('unique' in opts) {
                    t += `\t\tunique: true,\n`
                }
                if('populate' in opts) {
                    t += `\t\tref: '${opts.with}',\n`
                }
                if('min' in opts) {
                    if(type === 'string') {
                        t += `\t\tminLength: ${opts.min},\n`
                    } else if(type === 'number') {
                        t += `\t\tmin: ${opts.min},\n`
                    } else if(['date', 'time', 'datetime'].includes(type)) {
                        t += `\t\tmin: new Date('${opts.min}'),\n`
                    }
                }
                if('max' in opts) {
                    if(type === 'string') {
                        t += `\t\tmaxLength: ${opts.max},\n`
                    } else if(type === 'number') {
                        t += `\t\tmax: ${opts.max},\n`
                    } else if(['date', 'time', 'datetime'].includes(type)) {
                        t += `\t\tmax: new Date('${opts.max}'),\n`
                    }
                }
                if('default' in opts) {
                    if(type === 'number') {
                        t += `\t\tdefault: ${opts.default},\n`
                    } else if(['date', 'time', 'datetime'].includes(type)) {
                        t += `\t\tdefault: new Date('${opts.default}'),\n`
                    } else {
                        t += `\t\tdefault: '${opts.default}',\n`
                    }
                }
                if('enum' in opts) {
                    t += `\t\tenum: [${opts.enum.split(' ').join('').split(',').map(s => `'${s}'`).join(', ')}],\n`
                }
                if('match' in opts) {
                    t += `\t\tmatch: /${opts.match}/,\n`
                }
                if('trim' in opts) {
                    t += `\t\ttrim: true,\n`
                }
                if('uppercase' in opts) {
                    t += `\t\tuppercase: true,\n`
                }
                if('lowercase' in opts) {
                    t += `\t\tlowercase: true,\n`
                }
                t += '\t}'
                break
            }
        }
        return t
    }
    // generate types in schema
    // let reqs = new Set()
    let fstr = ''
    let fields = model[col].fields
    let keys = Object.keys(fields)
    let last = keys[keys.length - 1]
    for(let name of keys) {
        let { type, options: opts } = fields[name]
        // if(type === 'user') {
        //     reqs.add('users')
        // }
        // if(type === 'relation' && opts.with) {
        //     reqs.add(opts.with)
        // }
        fstr += `\t${name}: ${compileFieldType(type, opts)},`
        if(['user', 'relation'].includes(type)) {
            let pre = ''
            if(opts['one-to-one']) {
                pre = ' one-to-one'
            } else if(opts['one-to-many']) {
                pre = ' one-to-many'
            } else if(opts['many-to-one']) {
                pre = ' many-to-one'
            } else if(opts['many-to-many']) {
                pre = ' many-to-many'
            }
            fstr += ` //${pre} relation with ${opts.with || 'users'}`
            if(pre) {
                fstr +=` (${opts.with || 'users'}.${opts.named ? opts.named : col + '_' + name})`
            }
        }
        if(['password', 'article', 'file', 'location', 'role'].includes(type)) {
            fstr += ` // ${type}`
        }
        if(name !== last) {
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
    mkdir('routes')
    for(let col in model) {
        let fields = model[col].fields
        let keys = Object.keys(fields)

        write(`routes/${col}.js`,
`const express = require('express')
const Router = express.Router
const route = new Router()

const {
    ${col}: model,
    ${col}Schema: schema
} = require('../models/${col}.js')

// generates standard response
const response = require('../lib/response.js')
// populates req.mquery (mongoose compatible query)
// do not add private fields
const queryMaker = require('../lib/query-maker.js')
const query = queryMaker([\n\t${
    keys.
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
    if(pops.length > 0) {
        return `\tif(!["false", "0", "no"].includes(populate)) {\n\t\tquery = query.\n\t\t${pops}\n\t}`
    } else {
        return ""
    }
})()}
    query.exec((err, data) => {
        // delete unwanted or private fields here
${
    keys.
    map(k => fields[k]).
    filter(f => f.options.private).
    map(f => `\t\tdelete data.${f.name}\n`)
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
${
    keys.
    map(k => fields[k]).
    filter(f => f.options.private).
    map(f => `\t\tdelete data.${f.name}\n`)
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
    write('lib/response.js',
`
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
try {
    fs.mkdirSync(path.join(__dirname, "../", process.argv[3]))
} catch (err) {
    fs.rmdirSync(path.join(__dirname, "../", process.argv[3]), { recursive: true, force: true })
    fs.mkdirSync(path.join(__dirname, "../", process.argv[3]))
}
generate (
    JSON.parse(
        fs.readFileSync(process.argv[2]).toString()
    ),
    path.join(__dirname, "../", process.argv[3])
)