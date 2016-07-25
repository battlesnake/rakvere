/* See schema.js */

const _ = require('lodash');

const esc = require('../util/escape');
const listjoin = require('../util/listjoin');
const Custom = require('../query/Custom');

/* Copypasta from parse.js */
const rxSpecialFieldName = /^\$/;

module.exports = generate;

function generate(parsed, options) {

	options = options || {};

	const update = options.update;

	const modified_triggers = new Set();
	const extra = [];

	return generateSchemaSql(parsed.concreteTables);

	function generateSchemaSql(schemaDef) {
		const sql = [];
		if (!update) {
			sql.push(esc('DROP TABLE IF EXISTS :: CASCADE', _.keys(schemaDef)));
		}
		const tables = _(schemaDef).map(generateTableSql).flatten().value();
		sql.push(...extra, ...tables);
		return sql;
	}

	function generateTableSql(tableDef, tableName) {
		const allSql = _.map(tableDef, (def, name) => generateFieldSql(tableName, tableDef, name, def))
			.filter(s => s !== null);
		const tableSql = _(allSql).map('table').filter(x => x.length).value();
		const extraSql = _(allSql).map('postfix').filter(x => x.length).flatten().value();
		return [
			esc('CREATE TABLE !!:: (', update ? ' IF NOT EXISTS' : '', tableName),
			...listjoin(tableSql, ',', ')'),
			...extraSql
		];
		/* TODO: Alter existing table if `update` is set */
	}

	function generateFieldSql(tableName, tableDef, fieldName, fieldDef) {
		const templates = _.assign({
			index: 'CREATE INDEX ON :table: (!expr!)',
			unique: 'CREATE UNIQUE INDEX ON :table: (!expr!)'
		}, tableDef.$templates);
		fieldDef = _.clone(fieldDef);
		if (fieldName === '$postgen') {
			return {
				postfix: _(fieldDef).map((def, name) => [
					'-- Post-gen: ' + name,
					...(Array.isArray(def) ? def : [def]).map(line =>
						esc.named(line, _.assign({ table: tableName, name: fieldName }, tableDef.$attrs)))
				])
			};
		} else if (rxSpecialFieldName.test(fieldName)) {
			return null;
		}
		/* Column definition */
		const attrs = [];
		if (!fieldDef.nullable) {
			attrs.push('NOT NULL');
		}
		if (fieldDef.autoIncrement) {
			throw new Error('AUTO_INCREMENT not supported');
		}
		if (fieldDef.primary) {
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
			fieldDef.type = 'TIMESTAMP WITH TIME ZONE';
			attrs.push('DEFAULT clock_timestamp()');
		}
		if (fieldDef.type.toLowerCase() === 'modified_timestamp') {
			fieldDef.type = 'TIMESTAMP WITH TIME ZONE';
			attrs.push('DEFAULT clock_timestamp()');
			postfix.push(esc('CREATE TRIGGER :: BEFORE UPDATE ON :: FOR EACH ROW EXECUTE PROCEDURE ::()',
				'trg_' + tableName + '_' + fieldName + '_autoupdate',
				tableName,
				'autoupdate_timestamp_' + fieldName));
			if (!modified_triggers.has(fieldName)) {
				modified_triggers.add(fieldName);
				extra.push(...(
					new Custom()
						.name('autoupdate_timestamp_' + fieldName)
						.returns('TRIGGER')
						.body.append(esc('NEW.:: = clock_timestamp();', fieldName))
						.body.append('RETURN NEW;')
						.toFunction()));
			}
		}
		/* Foreign key constraint */
		if (fieldDef.foreign) {
			const fk = [];
			fk.push(esc('REFERENCES :: (::)', fieldDef.foreign, fieldDef.foreign + '_id'));
			if (fieldDef.onUpdate !== null) {
				fk.push(esc('ON UPDATE !!', fieldDef.onUpdate));
			}
			if (fieldDef.onDelete !== null) {
				fk.push(esc('ON DELETE !!', fieldDef.onDelete));
			}
			attrs.push(...fk);
			if (!fieldDef.index) {
				fieldDef.index = true;
			}
		}
		/* Index */
		if (typeof fieldDef.index === 'string') {
			postfix.push(esc.named(templates[fieldDef.unique ? 'unique' : 'index'], { table: tableName, expr: esc('::(::)', fieldDef.index, fieldName) }));
		} else if (fieldDef.index) {
			postfix.push(esc.named(templates[fieldDef.unique ? 'unique' : 'index'], { table: tableName, expr: esc.id(fieldName) }));
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
