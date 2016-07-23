const escape = require('../util/escape');

module.exports = (name, assertion, error) => [
	'-- Assertion: ' + name,
	escape('IF NOT (!!) THEN', assertion),
	[escape('RAISE EXCEPTION ??;', error)],
	'END IF;'
];
