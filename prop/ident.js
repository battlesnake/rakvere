const _ = require('lodash');
const esc = require('../escape');

const prop = require('./');

module.exports = (inst, name) => {
	const state = inst.$;
	state[name] = state[name] || null;
	state.get[name] = () => state[name] && esc.id(state[name]);
	prop.simple(inst, name);
};
