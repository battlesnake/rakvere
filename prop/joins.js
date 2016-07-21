const _ = require('lodash');
const esc = require('../escape');

const prop = require('./');

module.exports = (inst, name) => {
	const state = inst.$;
	state[name] = state[name] || [];
	state.get[name] = () => state[name];
	inst[name] = (...tables) => {
		const ar = _.cloneDeep(state[name]);
		tables.forEach(table => {
			ar.push(esc('JOIN ::', table));
			ar.push([esc('USING (::)', table + '_id')]);
		});
		return inst.clone({ [name]: ar });
	};
	inst[name].using = (table, ours, theirs) => {
		const ar = _.cloneDeep(state[name]);
		ar.push(esc('JOIN ::', table));
		ar.push([esc('ON (:: = ::.::)', ours, table, theirs)]);
		return inst.clone({ [name]: ar });
	};
};
