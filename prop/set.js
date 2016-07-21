module.exports = (inst, name) => {
	const state = inst.$;
	state[name] = state[name] || new Set();
	inst[name] = (...xs) => {
		const ar = new Set(state[name]);
		xs.forEach(x => ar.add(x));
		return inst.clone({ [name]: ar });
	};
	inst[name].replace = (...xs) => {
		const ar = new Set();
		xs.forEach(x => ar.add(x));
		return inst.clone({ [name]: ar });
	};
	inst[name].clear = () => inst.clone({ [name]: new Set() });
};
