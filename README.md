# Express NodeJS back-end project generator
script to generate a whole project including:
- express routes
- mongoose schemas and models
- webapp gui to create models without code
####  soon
- auth
- admin panel
- dev panel
- email
- logs
- prometheus and graphana

## install
- clone this repo
- install express and body-parser
```bash
npm install
```
or
```bash
yarn
```
- start the modeler web gui
```bash
node index.js
```
- open `localhost:5000` and make your data model and save
- your generated project is saved at `./build` and the model is saved at `./model.json`

## structure
- `models/*.js` export schemas and models
- `routes/*.js` export express routes
- `public/` is served at `/`
- `public/controller.js` is your client library
- `lib/*` are utility codes
- `index.js` is project entry code

## models
models are created with webapp gui [modeler](https://github.com/force1267/modeler).
the model is then saved in `model.json` file and is used to generate the code.
### field types and options
each model has many fields with types
`Any`, `Number`, `String`, `Boolean`, `Date`, `Time`, `Datetime`, `Password`, `Article`, `File`, `Location`, `User`, `Role`, `Relation`

each field can have options like `unique`, `private`, `min=` based on its type. you can find them out at [modeler](https://github.com/force1267/modeler) when entering them by press `Tab`. they will be suggested based on the selected type.

generated json looks like this:
```json
{
    "foods": {
        "name": "foods",
        "fields": {
            "name": {
                "name": "name",
                "type": "string",
                "options": {
                    "required": true,
                    "index": true
                }
            },
            "price": {
                "name": "ingredients",
                "type": "number",
                "options": {
                    "min": "0"
                }
            },
            "ingredients": {
                "name": "ingredients",
                "type": "string",
                "options": {}
            }
        }
    },
}
```

## routes and api
- `GET /` static files
- `GET /:model?query` get some entries
- `POST /:model` create an entry
- `PUT /:model?query` update some entries
- `DELETE /:model?query` delete some entries
- `GET /:model/:id` get an entry
- `PUT /:model/:id` update an entry
- `DELETE /:model/:id` delete an entry

## queries
- query is based on field names. `/foods?city=NY`
- `limit` and `skip` are used to limit the number of entries. `/foods?limit=5&skip=25` finds 26th to 30th `food`
- `sort` can be used to sort based on `asc`, `desc`, `ascending`, `descending`, `1`, `-1`, `field_name`, `-field_name`
- `populate=false` disables default populated fields.
- mongoose field modifiers can be used with `_` like `/foods?price_lte=10`
- these are available query modifiers: `gt`, `gte`, `lt`, `lte`, `ne`, `in`, `nin`
### examples
- `/foods?stars_gt=3`
- `/foods?delivery_ne=none`
- `/foods?type_in=burger,pizza`
- `/foods?color_nin=white,green`
### change available modifiers
`lib/query-maker.js` makes the query middleware. you can modify it to add more complex options.

## in development
this is a work in progress and many important features are missing.