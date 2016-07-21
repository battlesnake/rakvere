/* See schema.js */

const _ = require('lodash');

const esc = require('../util/escape');

/* Copypasta from parse.js */
const rxSpecialFieldName = /^\$/;

module.exports = generate;

function generate(parsed, options) {

	options = options || {};

	const update = options.update;

	return generateSchemaSql(parsed.concreteTables);

	function indent(s) {
		return '\t' + s.replace(/\n/g, '\n\t');
	}

	function generateSchemaSql(schemaDef) {
		const schemaSql = _.map(schemaDef, generateTableSql);
		const sql = [];
		if (!update) {
			sql.push(esc('DROP TABLE IF EXISTS :: CASCADE', [_.keys(schemaDef)]));
		}
		sql.push.apply(sql, schemaSql);
		return sql;
	}

	function generateTableSql(tableDef, tableName) {
		const tableSql = _.map(tableDef, generateFieldSql)
			.filter(s => s !== null)
			.join(', ');
		const sql = [];
		sql.push(esc('CREATE TABLE !! ?? (!!)', [update ? 'IF NOT EXISTS' : '', tableName, indent(tableSql)]));
		return sql.join('\n');
		/* TODO: Alter existing table if `update` is set */
	}

	function generateFieldSql(fieldDef, fieldName) {
		if (rxSpecialFieldName.test(fieldName)) {
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
			attrs.push(esc('DEFAULT !!', [fieldDef.default]));
		}
		if (fieldDef.onUpdate !== null && fieldDef.foreign === null) {
			attrs.push(esc('ON UPDATE !!', [fieldDef.onUpdate]));
		}
		const extras = [];
		/* Index */
		if (fieldDef.index) {
			extras.push(esc('INDEX (::)', [fieldName]));
		}
		/* Foreign key constraint */
		if (fieldDef.foreign) {
			const fk = [];
			const fkAttr = [];
			fkAttr.push(esc('REFERENCES :: (::)', [fieldDef.foreign, fieldDef.foreign + '_id']));
			if (fieldDef.onUpdate !== null) {
				fkAttr.push(esc('ON UPDATE !!', [fieldDef.onUpdate]));
			}
			if (fieldDef.onDelete !== null) {
				fkAttr.push(esc('ON DELETE !!', [fieldDef.onDelete]));
			}
			fk.push(esc('FOREIGN KEY (::)', [fieldName]));
			fk.push(indent(fkAttr.join('\n')));
			extras.push(fk.join('\n'));
		}
		/* Generate, paying attention to comma positioning */
		const sql = [];
		sql.push(esc(':: !!', [fieldName, fieldDef.type.toUpperCase()]));
		if (attrs.length) {
			sql.push(indent(attrs.join('\n')));
		}
		if (extras.length) {
			sql[sql.length - 1] += ',';
			sql.push(indent(extras.join(', ')));
		}
		return sql.join('\n');
	}

}
