const _ = require('lodash');

const keywords = require('./keywords');

function escapeNamed(format, values) {
	if (typeof format !== 'string') {
		throw new Error('Invalid format type: ' + typeof format);
	}
	if (arguments.length !== 2) {
		throw new Error('Invalid arguments');
	}
	const keys = _.keys(values);
	function get(name) {
		if (name.length === 0) {
			throw new Error('No parameter named, did you mean to use escape.format?');
		}
		if (!_.has(values, name) || Array.isArray(values)) {
			throw new Error(`Cannot find key ${name} in format arguments`);
		}
		return values[name];
	}
	/* :: permitted as it's used in type-wankery */
	return format.replace(/:(\w+):|\?(\w*)\?|!(\w*)!/g, (str, id, value, verbatim) => {
		if (typeof id === 'string') {
			return escapeId(get(id));
		} else if (typeof value === 'string') {
			return escapeValue(get(value));
		} else if (typeof verbatim === 'string') {
			return get(verbatim);
		} else {
			throw new Error('Unspecified error');
		}
	});
}

function escapeFormat(format, ...values) {
	if (typeof format !== 'string') {
		throw new Error('Invalid format type: ' + typeof format);
	}
	values = [...values];
	function get(name) {
		if (name.length > 0) {
			throw new Error('Parameter named, did you mean to use escape.named?');
		}
		if (values.length === 0) {
			throw new Error('Insufficient arguments for format string');
		}
		return values.shift();
	}
	const ret = format.replace(/:(\w*):|\?(\w*)\?|!(\w*)!/g, (str, id, value, verbatim) => {
		if (typeof id === 'string') {
			return escapeId(get(id));
		} else if (typeof value === 'string') {
			return escapeValue(get(value));
		} else if (typeof verbatim === 'string') {
			return get(verbatim);
		} else {
			throw new Error('Unspecified error');
		}
	});
	if (values.length > 0) {
		throw new Error('Too many arguments for format string');
	}
	return ret;
}

function assert(assertion) {
	if (!assertion) {
		throw new Error('Invalid data type');
	}
}

function escapeValue(value, separator = ', ') {
	if (value === null) {
		return 'NULL';
	} else if (value === undefined) {
		throw new Error('Cannot escape "undefined"');
	} else if (typeof value === 'string') {
		return escapeString(value);
	} else if (typeof value === 'number') {
		return escapeNumber(value);
	} else if (typeof value === 'boolean') {
		return escapeBoolean(value);
	} else if (Buffer.isBuffer(value)) {
		return escapeBinary(value);
	} else if (Array.isArray(value)) {
		return escapeArray(value, separator);
	} else if (value.toISOString) {
		return escapeDate(value);
	} else if (value.constructor === Object) {
		return escapeString(JSON.stringify(value));
	} else if (value instanceof Map) {
		return escapeMap([...value], separator);
	} else {
		throw new Error('Unsupported data type');
	}
}

function escapeId(value, separator = ', ') {
	if (Array.isArray(value)) {
		return value.map(x => escapeId(x)).join(separator);
	}
	assert(typeof value === 'string');
	return value.split('.')
		.map(s => escapeId.fast || keywords.has(s.toUpperCase()) ? `"${s}"` : s)
		.join('.');
}
escapeId.fast = true;

function escapeBoolean(value, separator = ', ') {
	if (Array.isArray(value)) {
		return value.map(x => escapeBoolean(x)).join(separator);
	}
	assert(typeof value === 'boolean');
	return value ? 'TRUE' : 'FALSE';
}

function escapeString(value, separator = ', ') {
	if (Array.isArray(value)) {
		return value.map(x => escapeString(x)).join(separator);
	}
	assert(typeof value === 'string');
	const escape = ~value.indexOf('\\') ? 'E' : '';
	return escape + "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function escapeNumber(value, separator = ', ') {
	if (Array.isArray(value)) {
		return value.map(x => escapeNumber(x)).join(separator);
	}
	assert(typeof value === 'number');
	return value.toString();
}

function escapeBinary(value, separator = ', ') {
	if (Array.isArray(value)) {
		return value.map(x => escapeBinary(x)).join(separator);
	}
	assert(Buffer.isBuffer(value));
	throw new Error('Not implemented');
}

function escapeDate(value, separator = ', ') {
	if (Array.isArray(value)) {
		return value.map(x => escapeDate(x)).join(separator);
	}
	assert(value.toISOString);
	return escapeString(value.toISOString());
}

function escapeArray(value, separator = ', ', itemFunc = escapeValue) {
	assert(Array.isArray(value));
	return value.map(x => itemFunc(x)).join(separator);
}

function escapeMap(kv, separator) {
	return kv.map(([key, value]) => escapeId(key) + ' = ' + escape(value))
		.join(separator);
}

function escapeAs(type, value) {
	switch (type) {
	case 'raw': case 'verbatim': case '!': return value;
	case 'value': case '?': return escapeValue(value);
	case 'id': case 'var' : case 'arg': case ':': return escapeId(value);
	default: throw new Error('Unknown format type: ' + type);
	}
}

function escapeArgs(...args) {
	return args.map(arg => {
		if (typeof arg === 'string') {
			return escapeId(arg);
		} else if (_.has(arg, 'type') && _.has(arg, 'value')) {
			return escapeAs(arg.type, arg.value);
		} else if (_.has(arg, 'value')) {
			return escapeValue(arg.value);
		} else if (arg === null) {
			return 'NULL';
		} else {
			throw new Error('Invalid argument specification');
		}
	})
	.join(', ');
}

const escape = escapeFormat;

escape.id = escapeId;
escape.value = escapeValue;
escape.boolean = escapeBoolean;
escape.string = escapeString;
escape.number = escapeNumber;
escape.binary = escapeBinary;
escape.date = escapeDate;
escape.array = escapeArray;
escape.map = escapeMap;
escape.as = escapeAs;
escape.args = escapeArgs;

escape.format = escapeFormat;
escape.named = escapeNamed;

module.exports = escape;
