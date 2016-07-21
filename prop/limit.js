const _ = require('lodash');

const prop = require('./');

module.exports = (inst, name) => {
	const state = inst.$;
	state[name] = _.has(state, name) ? state[name] : [];
	state.get[name] = () => state[name];
	prop.simple(inst, name);
};
