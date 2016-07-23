const escape = require('../util/escape');

module.exports = {
	when: (name, assertion, expr) => [
		'-- Return-when: ' + name,
		escape('IF !! THEN', assertion),
		[arguments.length > 1 ? escape('RETURN ::;', expr) : 'RETURN;'],
		'END IF;'
	],
	unless: (assertion, expr) => [
		'-- Return-unless: ' + name,
		escape('IF NOT (!!) THEN', assertion),
		[arguments.length > 1 ? escape('RETURN ::;', expr) : 'RETURN;'],
		'END IF;'
	]
};
