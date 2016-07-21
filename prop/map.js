const factory = (validator = x => x, getter = null) => (inst, name) => {
	const state = inst.$;
	state[name] = state[name] || new Map();
	if (getter) {
		state.get[name] = getter(state[name]);
	}
	inst[name] = (key, value) => {
		try {
			value = validator(key, value);
		} catch (e) {
			throw new Error(`Invalid parameter for field ${name}: name=${key}, value={ ${Object.keys(value).join(', ')} }, error=${e.message || e.toString()}`);
		}
		const ar = new Map(state[name]);
		ar.set(key, value);
		return inst.clone({ [name]: ar });
	};
	inst[name].clear = () => inst.clone({ [name]: new Map() });
};

module.exports = factory();
module.exports.factory = factory;
