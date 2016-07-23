const factory = (validator = x => x, getter = null) => (inst, name) => {
	const state = inst.$;
	state[name] = state[name] || new Set();
	if (getter) {
		state.get[name] = getter(state[name], inst);
	}
	const validateAll = xs => xs
		.map(x => {
			try {
				return validator(x);
			} catch (e) {
				throw new Error(`Invalid parameter for field ${name}: value=${x}, error=${e.message || e.toString()}`);
			}
		});
	inst[name] = (...xs) => {
		const ar = new Set(state[name]);
		xs = validateAll(xs).forEach(x => ar.add(x));
		return inst.clone({ [name]: ar });
	};
	inst[name].replace = (...xs) => {
		const ar = new Set();
		xs = validateAll(xs).forEach(x => ar.add(x));
		return inst.clone({ [name]: ar });
	};
	inst[name].clear = () => inst.clone({ [name]: new Set() });
};

module.exports = factory();
module.exports.factory = factory;
