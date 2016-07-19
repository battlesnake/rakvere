const parse = require('./parse');
const generate = require('./generate');

module.exports = {
	parse: parse,
	generateSQL: generate,
};

/*
 * Parsed schema:
 *  - classes: Lists expanded, defaults added
 *  - chains: Inheritance chains (ancestors on left)
 *  - tables: Table definitions
 *  - abstractTables: Abstract table definitions
 *  - concreteTables: Concrate table definitions
 *
 * Parsed field spec:
 *  - type: SQL type
 *  - nullable: bool
 *  - foreign: name of foreign table (link to primary key)
 *  - primary: bool
 *  - index: bool
 *  - unique: bool
 *  - default: expression
 *  - autoIncrement: bool
 *  - onUpdate: enum
 *  - onDelete: enum
 */
