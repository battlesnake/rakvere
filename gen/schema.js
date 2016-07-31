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
 *  - onUpdate: enum
 *  - onDelete: enum
 */

const _ = require('lodash');

const idType = 'uuid, primary, =uuid_generate_v4()';

/* Duplicated in generate.js */
const rxSpecialFieldName = /^\$/;

const nonListSpecialFields = ['$abstract', '$postgen', '$attrs', '$templates'];

const rxDefault = /^=(.+)$/;
const rxOnUpdate = /^\+=(.+)$/;
const rxOnDelete = /^-=(.+)$/;

const rxDecimal = /^decimal_?(\d+)(?:\.(\d+))?$/;

const classDefaults = {
	$inherits: ''
};

module.exports = parseSchema;

function parseSchema(schema) {

	const classes = _.mapValues(schema, parseClassSpec);

	const chains = _.mapValues(classes, resolveInheritance);

	const tables = _.mapValues(chains, implementTable);

	const abstractTables = _.pickBy(tables, _.property('$abstract'));

	const concreteTables = _.omitBy(tables, _.property('$abstract'));

	return {
		schema: schema,
		classes: classes,
		chains: chains,
		tables: tables,
		abstractTables: abstractTables,
		concreteTables: concreteTables
	};
}

function parseList(list, noEmpty) {
	if (list === null || list === undefined || list === '') {
		list = [];
	} else if (typeof list === 'string') {
		list = list.split(',').map(function (s) { return s.trim(); });
	} else if (!(list instanceof Array)) {
		throw new Error(`Invalid specifier ${JSON.stringify(list)}`);
	}
	if (noEmpty && list.length === 0) {
		throw new Error('Empty specifier not allowed');
	}
	return list;
}

function parseFieldSpec(spec) {
	const res = {
		type: null,
		nullable: null,
		foreign: null,
		primary: null,
		index: null,
		unique: null,
		default: null,
		onUpdate: null,
		onDelete: null
	};
	let type = spec[0];
	if (type.charAt(type.length - 1) === '?') {
		type = type.substr(0, type.length - 1);
		res.nullable = true;
	}
	if (type.charAt(0) === '>') {
		res.foreign = type.substr(1);
		type = parseList(idType)[0];
		if (type.toUpperCase() === 'SERIAL') {
			type = 'INTEGER';
		} else if (type.toUpperCase() === 'BIGSERIAL') {
			type = 'BIGINT';
		}
	}
	const dec = type.match(rxDecimal);
	if (dec) {
		const lhs = +(dec[1] || 0);
		const rhs = +(dec[2] || 0);
		type = 'decimal(' + (lhs + rhs) + ', ' + rhs + ')';
	}
	if (type.toUpperCase() === 'BLOB') {
		type = 'BYTEA';
	}
	if (type.toUpperCase() === 'DATETIME' || type.toUpperCase() === 'TIMESTAMP') {
		type = 'TIMESTAMP WITH TIME ZONE';
	}
	// if (type.toUpperCase() === 'WGS84') {
	// 	type = 'GEOGRAPHY(POINTZ, 4326)';
	// }
	res.type = type;
	spec.forEach((token, i) => {
		let m;
		if (i === 0) {
		} else if (token === 'index' || token === 'key') {
			res.index = true;
		} else if ((m = token.match(/^index=(\w+)$/))) {
			res.index = m[1];
		} else if ((m = token.match(/^unique=(\w+)$/))) {
			res.unique = true;
			res.index = m[1];
		} else if (token === 'unique' || token === 'uniq') {
			res.unique = true;
		} else if (token === 'primary' || token === 'primary key') {
			res.primary = true;
		} else if (token === '++' || token === 'auto increment') {
			throw new Error('Auto-increment not supported');
		} else if ((m = token.match(rxDefault))) {
			res.default = m[1];
		} else if ((m = token.match(rxOnUpdate))) {
			res.onUpdate = m[1];
		} else if ((m = token.match(rxOnDelete))) {
			res.onDelete = m[1];
		} else {
			throw new Error('Invalid field attribute: ' + token);
		}
	});
	return res;
}

function parseClassSpec(spec) {
	return _({})
		.defaults(spec, classDefaults)
		.mapValues((fieldSpec, fieldName) => {
			if (!~nonListSpecialFields.indexOf(fieldName)) {
				fieldSpec = parseList(fieldSpec);
			}
			if (!rxSpecialFieldName.test(fieldName)) {
				fieldSpec = parseFieldSpec(fieldSpec);
			}
			return fieldSpec;
		})
		.value();
}

function resolveInheritance(classDef, className, classes) {
	const parents = classDef.$inherits.map(parentName => {
		if (!_.has(classes, parentName)) {
			throw new Error('Class "' + parentName + '" not found');
		}
		return resolveInheritance(classes[parentName], parentName, classes);
	});
	return _([parents, classDef])
		.flattenDeep()
		/* Preserve right-most occurence of each class reference */
		.reverse().uniq().reverse()
		.value();
}

function implementTable(chain, tableName) {
	const primary = tableName + '_id';
	const isAbstract = chain[chain.length - 1].$abstract;
	return _(chain)
		.reduce((wrap, next) => {
			const o = wrap.value();
			return _(['$postgen', '$attrs', '$templates'])
					.map(key => [key, _.defaults({}, next[key], o[key])])
					.fromPairs()
					.defaults(next, o);
		}, _({ [primary]: parseFieldSpec(parseList(idType)) }))
		.assign({ $abstract: isAbstract, $name: tableName })
		.value();
}
