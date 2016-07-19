const _ = require('lodash');

const engine = 'pg';

const escape = require('../escape')[engine];
const escapeId = require('../escapeId')[engine];
const format = require('../format')[engine];

/* Copypasta from parse.js */
const rxSpecialFieldName = /^\$/;

module.exports = generate;

function generate(parsed, options) {

	options = options || {};

	const ugly = options.ugly;
	const update = options.update;

	const optionalNewLine = ugly ? ' ' : '\n';
	const listSeparator = ugly ? ',' : ', ';
	const listLineSeparator = ',' + optionalNewLine;

	return generateSchemaSql(parsed.concreteTables);

	function indent(s) {
		return ugly ? s : '\t' + s.replace(/\n/g, '\n\t');
	}

	function generateSchemaSql(schemaDef) {
		const schemaSql = _.map(schemaDef, generateTableSql);
		const sql = [];
		if (!update) {
			sql.push('drop table if exists ' + _.keys(schemaDef).map(escapeId).join(listSeparator) + ' cascade');
		}
		sql.push.apply(sql, schemaSql);
		return sql;
	}

	function generateTableSql(tableDef, tableName) {
		const tableSql = _.map(tableDef, generateFieldSql)
			.filter(s => s !== null)
			.join(listLineSeparator);
		const sql = [];
		sql.push('create table ' + (update ? 'if not exists ' : '') + escapeId(tableName) + ' (');
		sql.push(indent(tableSql));
		sql.push(')');
		return sql.join(optionalNewLine);
		/* TODO: Alter existing table if `update` is set */
	}

	function generateFieldSql(fieldDef, fieldName) {
		if (rxSpecialFieldName.test(fieldName)) {
			return null;
		}
		/* Column definition */
		const attrs = [];
		if (!fieldDef.nullable) {
			attrs.push('not null');
		}
		if (fieldDef.autoIncrement) {
			attrs.push('auto_increment');
		}
		if (fieldDef.primary) {
			attrs.push('primary key');
		}
		if (fieldDef.unique) {
			attrs.push('unique');
		}
		if (fieldDef.default !== null) {
			attrs.push('default ' + fieldDef.default);
		}
		if (fieldDef.onUpdate !== null && fieldDef.foreign === null) {
			attrs.push('on update ' + fieldDef.onUpdate);
		}
		const extras = [];
		/* Index */
		if (fieldDef.index) {
			extras.push('index (' + escapeId(fieldName) + ')');
		}
		/* Foreign key constraint */
		if (fieldDef.foreign) {
			const fk = [];
			const fkAttr = [];
			fkAttr.push('references ' + escapeId(fieldDef.foreign) + '(' + escapeId(fieldDef.foreign + '_id') + ')');
			if (fieldDef.onUpdate !== null) {
				fkAttr.push('on update ' + fieldDef.onUpdate);
			}
			if (fieldDef.onDelete !== null) {
				fkAttr.push('on delete ' + fieldDef.onDelete);
			}
			fk.push('foreign key (' + escapeId(fieldName) + ')');
			fk.push(indent(fkAttr.join(optionalNewLine)));
			extras.push(fk.join(optionalNewLine));
		}
		/* Generate, paying attention to comma positioning */
		const sql = [];
		sql.push(escapeId(fieldName) + ' ' + fieldDef.type);
		if (attrs.length) {
			sql.push(indent(attrs.join(optionalNewLine)));
		}
		if (extras.length) {
			sql[sql.length - 1] += ',';
			sql.push(indent(extras.join(listLineSeparator)));
		}
		return sql.join(optionalNewLine);
	}

}
