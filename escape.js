const _ = require('lodash');

function escape(format, values) {
	if (arguments.length === 1) {
		return format;
	}
	const keys = _.keys(values);
	function get(name) {
		if (keys.length === 0) {
			throw new Error('Insufficient arguments for format string');
		}
		if (name.length > 0) {
			if (!_.has(values, name) || Array.isArray(values)) {
				throw new Error(`Cannot find key ${name} in format arguments`);
			}
			return values[name];
		} else {
			return values[keys.shift()];
		}
	}
	return format.replace(/:(\w*):|\?(\w*)\?|!(\w*)!/g, (str, id, value, verbatim) => {
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
		return escapeMap(_.toPairs(value), separator);
	} else if (value instanceof Map) {
		return escapeMap([...value], separator);
	} else {
		throw new Error('Unsupported data type');
	}
}

function escapeId(value) {
	assert(typeof value === 'string');
	return '"' + value.replace(/\./g, '"."') + '"';
}

function escapeBoolean(value) {
	assert(typeof value === 'boolean');
	return value ? 'TRUE' : 'FALSE';
}

function escapeString(value) {
	assert(typeof value === 'string');
	const escape = ~value.indexOf('\\') ? 'E' : '';
	return escape + "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function escapeNumber(value) {
	assert(typeof value === 'number');
	return value.toString();
}

function escapeBinary(value) {
	assert(Buffer.isBuffer(value));
	throw new Error('Not implemented');
}

function escapeDate(value) {
	assert(value.toISOString);
	return escapeString(value.toISOString());
}

function escapeArray(value, separator = ', ', itemFunc = escapeValue) {
	assert(Array.isArray(value));
	return value.map(itemFunc).join(separator);
}

function escapeMap(kv, separator) {
	return kv.map(([key, value]) => escapeId(key) + '=' + escape(value))
		.join(separator);
}

escape.id = escapeId;
escape.value = escapeValue;
escape.boolean = escapeBoolean;
escape.string = escapeString;
escape.number = escapeNumber;
escape.binary = escapeBinary;
escape.date = escapeDate;
escape.array = escapeArray;
escape.map = escapeMap;

module.exports = escape;
