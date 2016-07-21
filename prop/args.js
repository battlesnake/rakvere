const _ = require('lodash');

const esc = require('../util/escape');
const type = require('../util/type');
const prop = {
	map: require('./map')
};

const validator = (name, value) => {
	if (!_.has(value, 'type')) {
		throw new Error('Argument "type" not specified');
	}
	return value;
};

const getter = data => proto => (
	proto ? 
		[...data].map(([name, arg]) =>
			esc(':: !!', name, type(arg.type))) :
		[...data].map(([name, arg]) =>
			esc('::', name))
	).join(', ');

module.exports = prop.map.factory(validator, getter);
