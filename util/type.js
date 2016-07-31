const _ = require('lodash');

const esc = require('./escape');

module.exports = type;

function type(t) {
	const l = typeof t === 'string' ? t.toLowerCase() : null;
	let m;
	const match = rx => {
		if (typeof t !== 'string') {
			return false;
		}
		return (m = l.match(rx));
	};
	if (t === Object) {
		return 'RECORD';
	} else if (t === String || l === 'string') {
		return 'CHARACTER VARYING(255)';
	} else if (match(/^string\[(\d+)\]$/i)) {
		return 'CHARACTER VARYING(' + m[1] + ')';
	} else if (l === 'text') {
		return 'TEXT';
	} else if (l === 'int' || l === 'integer') {
		return 'INT';
	} else if (t === Number || l === 'bigint') {
		return 'BIGINT';
	} else if (t === Boolean || l === 'bool' || l === 'boolean') {
		return 'BOOLEAN';
	} else if (t === Buffer || l === 'buffer ' || l === 'binary') {
		return 'BYTEA';
	} else if (t === Date || l === 'date' || l === 'timestamp') {
		return 'TIMESTAMP';
	} else if (l.match(/^(?:decimal)?(\d+)\.(\d+)$/i)) {
		return 'DECIMAL(' + m[1] + ', ' + m[2] + ')';
	} else if (l === 'ip') {
		return 'INET';
	} else if (l === 'mac') {
		return 'MACADDR';
	} else if (typeof t === 'string') {
		return t;
	} else {
		throw new Error('Invalid type');
	}
}

type.arglist = obj => [...obj]
		.map(([name, { type }]) => esc(':: !!', [name, type]))
		.join(', ');

type.varlist = obj => _.toPairs(obj || {})
		.map(([name, { type }]) => esc(':: !!;', [name, type]));
