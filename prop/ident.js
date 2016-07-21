const _ = require('lodash');
const esc = require('../util/escape');

const prop = {
	simple: require('./simple')
};

const format = id => {
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

module.exports = (inst, name) => {
	const state = inst.$;
	state[name] = state[name] || null;
	state.get[name] = () => format(state[name]);
	prop.simple(inst, name);
};

module.exports.format = format;
