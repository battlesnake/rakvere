/* See schema.js */

const _ = require('lodash');

const esc = require('../util/escape');
const listjoin = require('../util/listjoin');
const Custom = require('../query/Custom');

/* Copypasta from parse.js */
const rxSpecialFieldName = /^\$/;

module.exports = generate;

function hanging(ar) {
	if (ar.length === 1) {
		return [ar[0]];
	} else if (ar.length > 1) {
		ar = [...ar];
		return [ar.shift(), ar];
	} else {
		throw new Error('Invalid type or empty');
	}
}

function generate(parsed, options) {

	options = options || {};

	const update = options.update;

	const modified_triggers = new Set();

	return generateSchemaSql(parsed.concreteTables);

	function generateSchemaSql(schemaDef) {
		const sql = [];
		if (!update) {
			sql.push(esc('DROP TABLE IF EXISTS :: CASCADE', _.keys(schemaDef)));
		}
		const tables = _(schemaDef)
			.map(generateTableSql)
			.reduce((xs, x) => _.mergeWith(xs, x, _.ary(_.concat, 2)), { table: [], postfix: [] });
		sql.push(...tables.table, ...tables.postfix);
		return sql;
	}

	function generateTableSql(tableDef, tableName) {
		/* TODO: Alter existing table if `update` is set */
		const allSql = _.map(tableDef, (def, name) => generateFieldSql(tableName, tableDef, name, def))
			.filter(s => s !== null);
		const tableSql = _(allSql).map('table').filter(x => x && x.length).value();
		const extraSql = _(allSql).map('postfix').filter(x => x && x.length).flatten().value();
		return {
			table: [
				esc('CREATE TABLE !!:: (', update ? ' IF NOT EXISTS' : '', tableName),
				...listjoin(tableSql, ',', ')')
			],
			postfix: extraSql
		};
	}

	function generateFieldSql(tableName, tableDef, fieldName, fieldDef) {
		const templates = _.assign({
			index: 'CREATE INDEX ON :table: (!expr!)',
			unique: 'CREATE UNIQUE INDEX ON :table: (!expr!)'
		}, tableDef.$templates);
		fieldDef = _.clone(fieldDef);
		if (fieldName === '$postgen') {
			return {
				postfix: _(fieldDef)
					.map((line, name) => {
						if (line === undefined || line === null || line.length === 0) {
							return [];
						}
						const res = [];
						if (!Array.isArray(line)) {
							line = [line];
						}
						const vars = _.assign({ table: tableName, name }, tableDef.$attrs);
						const xs = hanging(line.map(x => esc.named(x, vars)));
						xs.unshift('-- Post-gen: ' + name);
						return xs;
					})
					.flatten()
					.value()
			};
		} else if (fieldName === '$primary') {
			return tableDef.$primary.defaultSurrogate ? {} : {
				postfix: [...hanging([
					esc('ALTER TABLE ::', tableName),
					esc('ADD CONSTRAINT ::', [tableName, 'pk'].join('_')),
					esc('PRIMARY KEY (::)', fieldDef)
				])]
			};
		} else if (rxSpecialFieldName.test(fieldName)) {
			return {};
		}
		/* Column definition*/
		const attrs = [];
		if (!fieldDef.nullable) {
			attrs.push('NOT NULL');
		}
		if (fieldDef.autoIncrement) {
			throw new Error('AUTO_INCREMENT not supported');
		}
		/* Done via ALTER TABLE now, to support custom primary keys */
		if (fieldDef.primary && tableDef.$primary.defaultSurrogate) {
			attrs.push('PRIMARY KEY');
		}
		if (fieldDef.unique) {
			attrs.push('UNIQUE');
		}
		if (fieldDef.default !== null) {
			attrs.push(esc('DEFAULT !!', fieldDef.default));
		}
		const postfix = [];
		/* Timestamps */
		if (fieldDef.type.toLowerCase() === 'creation_timestamp') {
			fieldDef.type = 'TIMESTAMP';
			attrs.push('DEFAULT clock_timestamp()');
		}
		if (fieldDef.type.toLowerCase() === 'modified_timestamp') {
			fieldDef.type = 'TIMESTAMP';
			attrs.push('DEFAULT clock_timestamp()');
			const funcName = `autoupdate_timestamp_${fieldName}`;
			const trigName = `trg_${tableName}_${fieldName}_autoupdate`;
			/* Trigger function */
			if (!modified_triggers.has(fieldName)) {
				modified_triggers.add(fieldName);
				postfix.push(...(
					new Custom()
						.name(funcName)
						.returns('TRIGGER')
						.body.append(esc('NEW.:: = clock_timestamp();', fieldName))
						.body.append('RETURN NEW;')
						.toFunction()));
			}
			/* Trigger */
			const trg = [
				esc('CREATE TRIGGER ::', trigName),
				esc('BEFORE UPDATE ON ::', tableName),
				esc('FOR EACH ROW EXECUTE PROCEDURE ::()', funcName)
			];
			postfix.push(...hanging(trg));
		}
		/* Foreign key constraint */
		if (fieldDef.foreign) {
			if (!fieldDef.index) {
				fieldDef.index = true;
			}
			const fk = [
				esc('ALTER TABLE ::', tableName),
				esc('ADD CONSTRAINT ::', [tableName, fieldName, fieldDef.foreign, 'fk'].join('_')),
				esc('FOREIGN KEY (::)', fieldName),
				esc('REFERENCES :: (::)', fieldDef.foreign, fieldDef.foreign + '_id')
			];
			fk.push(esc('ON UPDATE !!', fieldDef.onUpdate));
			fk.push(esc('ON DELETE !!', fieldDef.onDelete));
			postfix.push(...hanging(fk));
		}
		/* Index */
		if (typeof fieldDef.index === 'string') {
			const sql = esc.named(templates[fieldDef.unique ? 'unique' : 'index'], { table: tableName, expr: esc('::(::)', fieldDef.index, fieldName) });
			postfix.push(sql);
		} else if (fieldDef.index) {
			const sql = esc.named(templates[fieldDef.unique ? 'unique' : 'index'], { table: tableName, expr: esc.id(fieldName) });
			postfix.push(sql);
		}
		/* Generate, paying attention to comma positioning */
		const table = [];
		table.push(esc(':: !!', fieldName, fieldDef.type.toUpperCase()));
		if (attrs.length) {
			table.push(attrs);
		}
		return { table, postfix };
	}

}
