/* See schema.js */

const _ = require('lodash');

const esc = require('../util/escape');
const listjoin = require('../util/listjoin');
const Custom = require('../query/Custom');

/* Copypasta from parse.js */
const rxSpecialFieldName = /^\$/;

const PRI_DROP = 0;
const PRI_TABLE = 10;
const PRI_PRIMARY = 20;
const PRI_UNIQUE = 30;
const PRI_INDEX = 40;
const PRI_FOREIGN = 50;
const PRI_TRIGGER = 60;
const PRI_TRIGGERFUNC = 65;
const PRI_CUSTOM = 100;

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

function dump(x) {
	process.stderr.write(JSON.stringify(x, null, 4) + '\n');
	return x;
}

function generate(parsed, options) {

	options = options || {};

	const update = options.update;

	/* TODO: Alter existing table if `update` is set */
	if (update) {
		throw new Error('"update" must be false, only re-creation is currently supported');
	}

	const modified_triggers = new Set();

	return generateSchemaSql(parsed.concreteTables);

	function generateSchemaSql(schemaDef) {
		return _(schemaDef)
			.map((tableDef, tableName) => generateTableSql(tableName, tableDef))
			.flatten()
			.concat([{
				priority: PRI_DROP,
				sql: [esc('DROP TABLE IF EXISTS :: CASCADE', _.keys(schemaDef))]
			}])
			.sortBy('priority')
			.map('sql')
			.flatten()
			.value();
	}

	function generateTableSql(tableName, tableDef) {
		const info = _.reduce(tableDef,
			(res, fieldDef, fieldName) =>
				generateFieldSql(res, tableName, tableDef, fieldName, fieldDef),
			{ fields: [], other: [] });
		return [
			{
				priority: PRI_TABLE,
				sql: [
					esc('CREATE TABLE :: (', tableName),
					listjoin.list(info.fields, ',', ')')
				]
			},
			...info.other.map(x => x)
		];
	}

	function generateFieldSql(res, tableName, tableDef, fieldName, fieldDef) {
		const templates = _.assign({
			index: 'CREATE INDEX ON :table: (!expr!)',
			unique: 'CREATE UNIQUE INDEX ON :table: (!expr!)'
		}, tableDef.$templates);
		fieldDef = _.clone(fieldDef);
		if (fieldName === '$postgen') {
			res.other.push({
				priority: PRI_CUSTOM,
				sql: _(fieldDef)
					.map((line, name) => {
						if (line === undefined || line === null || line.length === 0) {
							return [];
						}
						const res = [];
						if (!Array.isArray(line)) {
							line = [line];
						}
						line = line.map(x => x.$template ? esc.named(templates[x.$template], _.assign(x, { table: tableName })) : x);
						const vars = _.assign({ table: tableName, name }, tableDef.$attrs);
						const xs = hanging(line.map(x => esc.named(x, vars)));
						xs.unshift('-- Post-gen: ' + name);
						return xs;
					})
					.flatten()
					.value()
			});
			return res;
		} else if (fieldName === '$primary') {
			if (tableDef.$primary.defaultSurrogate) {
				return res;
			}
			res.other.push({
				priority: PRI_PRIMARY,
				sql: [...hanging([
					esc('ALTER TABLE ::', tableName),
					esc('ADD CONSTRAINT ::', [tableName, 'pk'].join('_')),
					esc('PRIMARY KEY (::)', fieldDef)
				])]
			});
			return res;
		} else if (rxSpecialFieldName.test(fieldName)) {
			return res;
		}
		/* Column definition*/
		const attrs = [];
		if (!fieldDef.nullable) {
			attrs.push('NOT NULL');
		}
		if (fieldDef.primary && tableDef.$primary.defaultSurrogate) {
			attrs.push('PRIMARY KEY');
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
				postfix.push({
					priority: PRI_TRIGGERFUNC,
					sql: new Custom()
						.name(funcName)
						.returns('TRIGGER')
						.body.append(esc('NEW.:: = clock_timestamp();', fieldName))
						.body.append('RETURN NEW;')
						.toFunction()
				});
			}
			/* Trigger */
			const trg = [
				esc('CREATE TRIGGER ::', trigName),
				esc('BEFORE UPDATE ON ::', tableName),
				esc('FOR EACH ROW EXECUTE PROCEDURE ::()', funcName)
			];
			postfix.push({
				priortiy: PRI_TRIGGER,
				sql: hanging(trg)
			});
		}
		/* Foreign key constraint */
		if (fieldDef.foreign && (!fieldDef.composite || !fieldDef.composite.fkDone)) {
			if (!fieldDef.index) {
				fieldDef.index = true;
			}
			const { foreign, composite } = fieldDef;
			if (composite) {
				composite.fkDone = true;
			}
			const otherFields = composite ? composite.to : foreign.field;
			const localFields = composite ? composite.from : fieldName;
			const name = (composite ? [tableName, composite.name, 'fk'] : [tableName, fieldName, fieldDef.foreign.table, fieldDef.foreign.field, 'fk']).join('_');
			const fk = [
				esc('ALTER TABLE ::', tableName),
				esc('ADD CONSTRAINT ::', name),
				esc('FOREIGN KEY (::)', localFields),
				esc('REFERENCES :: (::)', foreign.table, otherFields)
			];
			fk.push(esc('ON UPDATE !!', fieldDef.onUpdate));
			fk.push(esc('ON DELETE !!', fieldDef.onDelete));
			postfix.push({
				priority: PRI_FOREIGN,
				sql: hanging(fk)
			});
		}
		/* Index */
		if (typeof fieldDef.index === 'string') {
			const sql = [esc.named(templates[fieldDef.unique ? 'unique' : 'index'], { table: tableName, expr: esc('::(::)', fieldDef.index, fieldName) })];
			postfix.push({ priority: PRI_INDEX, sql });
		} else if (fieldDef.index) {
			const sql = [esc.named(templates[fieldDef.unique ? 'unique' : 'index'], { table: tableName, expr: esc.id(fieldName) })];
			postfix.push({ priority: PRI_UNIQUE, sql });
		}
		/* Generate, paying attention to comma positioning */
		res.fields.push(esc(':: !!', fieldName, fieldDef.type.toUpperCase()));
		if (attrs.length) {
			res.fields.push(attrs);
		}
		res.other.push(...postfix);
		return res;
	}

}
