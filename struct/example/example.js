const schema = require('./example-schema');
const dbgen = require('../');

const ugly = ~process.argv.indexOf('--ugly') || process.env.ugly;

/* Parse the schema */
const parsed = dbgen.parse(schema);

/* Generate array of SQL commands */
const sqlArray = dbgen.generateSQL(parsed, { ugly: ugly });

/* Add semicolon to end of each SQL command, Join SQL commands */
const sql = sqlArray.map((s) => s + ';').join('\n\n') + '\n';

process.stdout.write(sql);

process.exit();
