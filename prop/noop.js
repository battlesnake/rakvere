module.exports = (inst, name) => {
	const state = inst.$;
	inst[name] = (...args) => {
		if (args.length) {
			throw new Error('No arguments expected');
		}
		return inst.clone();
	};
};
