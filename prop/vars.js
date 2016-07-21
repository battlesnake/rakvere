const _ = require('lodash');

const esc = require('../escape');
const type = require('../type');
const prop = {
	map: require('./map')
};

const validator = (name, value) => {
	if (!_.has(value, 'type')) {
		throw new Error('Argument "type" not specified');
	}
	return true;
};

const getter = data => prefix => [
	...(prefix && data.size ? ['DECLARE'] : []),
	[...data].map(([name, arg]) => esc(':: !!;', name, type(arg.type)))
];

module.exports = prop.map.factory(validator, getter);
