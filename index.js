const path = require('path')
const fs = require('fs')

const express = require('express')
const body = require('body-parser')

const gen = require('./lib/gen.js')

const app = express()
app.use(body.json())


app.get('/load', (req, res) => {
    if(fs.existsSync('model.json')) {
        let model = fs.readFileSync('model.json')
        return res.json(JSON.parse(model.toString()))
    }
    return res.json({})
})
app.post('/generate', (req, res) => {
    let model = JSON.stringify(req.body)
    // save
    fs.writeFileSync('model.json', model)

    // generate
    let dir = process.argv[2] || './build'
    if(dir[0] === ".") {
        dir = path.join(__dirname, dir)
    }
    try {
        fs.mkdirSync(dir)
    } catch (err) {
        fs.rmdirSync(dir, { recursive: true, force: true })
        fs.mkdirSync(dir)
    }
    try {
        gen(req.body, dir)
    } catch (err) {
        console.log(err.message)
        return res.send(err.message)
    }
    return res.send("ok")
})

app.use('/', express.static(path.join(__dirname, 'modeler')))

app.listen(5000)
console.log("http://localhost:5000")