const escape = require('./escape');
const escapeId = require('./escapeId');

module.exports = {
	pg: (fmt, args) => format(fmt, args, escape.pg, escapeId.pg),
	my: (fmt, args) => format(fmt, args, escape.my, escapeId.my),
};

function format(fmt, args, escape, escapeId) {
	if (typeof fmt !== 'string') {
		throw new Error('Format string is not a string');
	}
	args = args || [];
	let index = 0;
	let isArray = Array.isArray(args);
	function get(name, func) {
		let value;
		if (isArray) {
			if (index === args.length) {
				throw new Error('Not enough arguments to satisfy substitution "' + name + '"');
			}
			value = args[index++];
		} else {
			if (args[name] === undefined) {
				throw new Error('Cannot find value for substitution "' + name + '"');
			}
			value = args[name];
		}
		if (Array.isArray(value)) {
			return value.map(func).join(', ');
		} else {
			return func(value);
		}
	}
	return fmt.replace(/\?(\w*)\?|:(\w*):/g, (s, v, k) => {
		if (v !== undefined) {
			return get(v, escape);
		} else {
			return get(k, escapeId);
		}
	});
}
