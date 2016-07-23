const _ = require('lodash');

const prop = {
	simple: require('./simple')
};

module.exports = (inst, name) => {
	const state = inst.$;
	state[name] = state[name] || [];
	prop.simple(inst, name);
	inst[name] = (...blocks) => {
		const ar = _.cloneDeep(state[name]);
		ar.push(...blocks);
		return inst.clone({ [name]: ar });
	};
	inst[name].append = inst[name];
	inst[name].prepend = (...blocks) => {
		const ar = _.cloneDeep(state[name]);
		ar.unshift(...blocks);
		return inst.clone({ [name]: ar });
	};
	inst[name].replace = (...blocks) => {
		return inst.clone({ [name]: blocks });
	};
	inst[name].clear = () => inst.clone({ [name]: [] });
};
