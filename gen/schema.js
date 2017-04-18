/*
 * Parses and flattens table specs
 *
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
 *  - onUpdate: enum (CASCADE/DELETE/RESTRICT/NO ACTION)
 *  - onDelete: enum (CASCADE/DELETE/RESTRICT/NO ACTION/SET NULL/SET DEFAULT)
 *
 * $abstract: Table is abstract
 * $postgen: Dictionary of extra SQL (arrays) to add after table definitions
 *   (can be overridden per-key by descendant tables).  The SQL lines are passed
 *   to the rakvere.util.escapeNamed function, and the table name and $postgen
 *   key name are passed in as replacements 'table' and 'name'.
 * $attrs: Dictionary of extra named replacements to be passed to escapeNamed
 *   function for $postgen, can be overridden per-name by descendant tables.
 * $templates: Dictionary of templates to use for creating indexes, unique
 *   constraints, etc.
 */

const _ = require('lodash');

//const idType = 'serial, primary';
const idType = 'uuid, primary, =uuid_generate_v4()';

/* Duplicated in tables.js */
const rxSpecialFieldName = /^\$/;

const nonListSpecialFields = ['$abstract', '$postgen', '$attrs', '$templates', '$comment'];

const rxComment = /^#\s*(.*)$/;

const rxDefault = /^=(.+)$/;
const rxOnUpdate = /^\+=(.+)$/;
const rxOnDelete = /^-=(.+)$/;

const rxNullable = /^(.*)\?$/;
const rxDecimal = /^decimal_?(\d+)(?:\.(\d+))?$/;

const rxDefaultFk = /^>$/;
const rxAutoFk = /^>(\w+)$/;
const rxSimpleFk = /^>(\w+)\.(\w+)$/;
const rxMultiFk = /^>(\w+)\[((?:\w+;)*\w+)\]$/;

const classDefaults = {
	$inherits: ''
};

const defaultUpdateAction = 'CASCADE';
const defaultDeleteAction = 'CASCADE';

const fk_tmp = {};

module.exports = parseSchema;

function parseSchema(schema) {

	const classes = _.mapValues(schema, parseClassSpec);

	const chains = _.mapValues(classes, resolveInheritance);

	const refTables = _.mapValues(chains, implementTable);

	const tables = resolveTypeReferences(resolveFieldReferences(refTables));

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

function resolveTypeReferences(tables) {
	let todo = [];
	_.each(tables, table => _.each(table, field => {
		if (field && field.$_ref) {
			todo.push(field);
		}
	}));
	while (todo.length) {
		todo = todo.filter(field => {
			const foreign = tables[field.foreign.table][field.foreign.field];
			if (foreign.type === fk_tmp) {
				return true;
			}
			field.type = foreign.type;
			return false;
		});
	}
	return tables;
}

function resolveFieldReferences(tables) {
	return _.mapValues(tables, (table, tableName) => _.reduce(table, (res, field, fieldName) => {
		/* Pass through to result (removed if compound reference) */
		field = _.clone(field);
		res[fieldName] = field;
		/* Not foreign key */
		if (!field || !field.foreign) {
			return res;
		}
		const other = field.foreign.table;
		if (!tables[other]) {
			throw new Error(`Foreign key ${tableName}.${fieldName} references non-existant table ${other}`);
		}
		const refs = field.foreign.fields;
		/* Expand default foreign key */
		if (refs.length === 0) {
			const ref = tables[other].$primary;
			if (!ref || ref.length === 0) {
				throw new Error(`Foreign key ${tableName}.${fieldName} references table with undefined or compound primary key`);
			}
			refs.push(...ref);
		}
		/* Expand simple foreign key */
		if (refs.length === 1) {
			const ref = refs[0];
			const foreign = tables[other][ref];
			if (!foreign) {
				throw new Error(`Foreign key ${tableName}.${fieldName} references non-existant field ${other}.${ref}`);
			}
			if (!foreign.type) {
				throw new Error(`Failed to resolve type of foreign key field ${tableName}.${fieldName}`);
			}
			field.$_ref = true;
			field.foreign = {
				table: other,
				field: ref
			};
			return res;
		}
		/* Expand compound foreign-key */
		delete res[fieldName];
		const composite = {
			name: fieldName,
			table: other,
			to: refs,
			from: refs.map(ref => [fieldName, ref].join('_'))
		};
		refs.forEach(ref => {
			const foreign = tables[other][ref];
			if (!foreign) {
				throw new Error(`Compound foreign key ${tableName}.${fieldName} references non-existant field ${other}.${ref}`);
			}
			const name = [fieldName, ref].join('_');
			if (_.has(table, name)) {
				throw new Error(`Field-name collision while expanding compound reference ${tableName}.${fieldName} => ${fieldName}_${ref}`);
			}
			if (!foreign.type) {
				throw new Error(`Failed to resolve type of foreign key field ${tableName}.${fieldName}_${ref}`);
			}
			res[name] = _.assign({}, field, {
				$_ref: true,
				foreign: {
					table: other,
					field: ref
				},
				composite
			});
		});
		return res;
	}, {}));
}

function parseFieldSpec(name, spec) {
	const res = {
		comment: null,
		type: null,
		nullable: null,
		foreign: null,
		primary: null,
		index: null,
		unique: null,
		default: null,
		onUpdate: defaultUpdateAction,
		onDelete: defaultDeleteAction
	};
	/* Parse type */
	let type = spec[0];
	let m;
	if ((m = type.match(rxNullable))) {
		type = m[1];
		res.nullable = true;
	}
	if ((m = type.match(rxDefaultFk))) {
		res.foreign = {
			table: name,
			fields: []
		};
		type = fk_tmp;
	} else if ((m = type.match(rxAutoFk))) {
		res.foreign = {
			table: m[1],
			fields: []
		};
		type = fk_tmp;
	} else if ((m = type.match(rxSimpleFk))) {
		res.foreign = {
			table: m[1],
			fields: [m[2]]
		};
		type = fk_tmp;
	} else if ((m = type.match(rxMultiFk))) {
		res.foreign = {
			table: m[1],
			fields: m[2].split(';')
		};
		type = {};
	} else if ((m = type.match(rxDecimal))) {
		const lhs = +(m[1] || 0);
		const rhs = +(m[2] || 0);
		type = 'decimal(' + (lhs + rhs) + ', ' + rhs + ')';
	} else if (type.toUpperCase() === 'BLOB') {
		type = 'BYTEA';
	} else if (type.toUpperCase() === 'DATETIME' || type.toUpperCase() === 'TIMESTAMP') {
		type = 'TIMESTAMP';
	}
	res.type = type;
	/* Parse everything else */
	spec.forEach((token, i) => {
		let m;
		if (i === 0) {
			/* Skip */
		} else if ((m = token.match(rxComment))) {
			res.comment = m[1];
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
				fieldSpec = parseFieldSpec(fieldName, fieldSpec);
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
	const last = chain[chain.length - 1];
	const isAbstract = last.$abstract;
	const comment = last.$comment;
	return _(chain)
		.reduce((wrap, next) => {
			const o = wrap.value();
			return _(['$postgen', '$attrs', '$templates'])
					.map(key => [key, _.defaults({}, next[key], o[key])])
					.fromPairs()
					.defaults(next, o);
		}, _({}))
		.assign({ $abstract: isAbstract, $comment: comment, $name: tableName })
		.tap(x => {
			/* Primary keys */
			const keys = _(x)
				.toPairs()
				.filter(kv => kv[1] && kv[1].primary)
				.map(kv => kv[0])
				.value();
			/* Natural primary key */
			if (keys.length) {
				if (x.$primary) {
					throw new Error(`"primary" specifier given for fields ${keys.join(', ')} of table ${tableName}, but $primary also specified`);
				}
				x.$primary = keys;
			}
			/* Default surrogate primary key */
			if (!x.$primary) {
				const primary = tableName + '_id';
				x.$primary = [primary];
				x.$primary.defaultSurrogate = true;
				x[primary] = parseFieldSpec(primary, parseList(idType));
				return;
			}
			/* Force PK to be array if single item */
			if (!Array.isArray(x.$primary)) {
				x.$primary = [x.$primary];
			}
			if (x.$abstract) {
				return;
			}
			/* Check for missing fields in concrete table PK definition */
			const missing = x.$primary
				.filter(key => !_.has(x, key))
				.map(s => '"' + s + '"')
				.join(', ');
			if (missing === '') {
				return;
			}
			throw new Error(`Primary key(s) ${missing} of table "${tableName}" is/are not defined and table is not marked as abstract`);
		})
		.value();
}
