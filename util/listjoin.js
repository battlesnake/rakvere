const _ = require('lodash');

const append = (x, a) => {
	if (typeof x === 'string') {
		return x + a;
	} else if (Array.isArray(x)) {
		if (x.length === 0) {
			throw new Error('Empty!');
		}
		const last = x.pop();
		return [...x, append(last, a)];
	} else {
		throw new Error('Invalid type');
	}
};

module.exports = (xs, sep = '', term = '') => xs.map((x, i) => i === xs.length - 1 ? append(x, term) : append(x, sep));

module.exports.blocks = (xs, sep = '') => _.reduceRight(xs, (state, x) => {
	state.res.unshift(state.prev ? append(x, sep) : x);
	state.prev = typeof x === 'string';
	return state;
}, { res: [], prev: true }).res;
