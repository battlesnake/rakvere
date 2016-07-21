const _ = require('lodash');
const esc = require('../escape');
const listjoin = require('../listjoin');

const prop = {
	set: require('./set')
};

const validator = id => {
	if (id.expr && id.alias) {
		return esc('!! AS ::', id.expr, id.alias);
	} else if (id.id && id.alias) {
		return esc(':: AS ::', id.id, id.alias);
	} else if (typeof id === 'string') {
		return esc.id(id);
	} else {
		throw new Error('Invalid parameter');
	}
};

const getter = state => () => listjoin([...state], ',');

module.exports = prop.set.factory(validator, getter);
