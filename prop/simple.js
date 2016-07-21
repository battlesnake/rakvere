const _ = require('lodash');

module.exports = (inst, name, def = null) => {
	const state = inst.$;
	if (!_.has(state, name)) {
		state[name] = _.has(state, name) ? state[name] : def;
	}
	if (!_.has(state.get, name)) {
		state.get[name] = () => state[name];
	}
	inst[name] = value => inst.clone({ [name]: value });
};
