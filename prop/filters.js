const _ = require('lodash');

const esc = require('../util/escape');
const listjoin = require('../util/listjoin');

const crypt = require('../crypt');

const reg = new Map();

const filters = (inst, name) => {
	const state = inst.$;
	state[name] = state[name] || [];

	state.get[name] = () => state[name]
		.map((conds, i) => {
			conds = conds.filter(cond => cond.length);
			if (conds.length > 1) {
				conds.unshift('(' + conds.shift());
				conds.push(conds.pop() + ')');
			}
			return listjoin(conds, ' OR', i === state[name].length - 1 ? '' : ' AND');
		})
		.reduce((all, item) => {
			if (item.length) {
				all.push(item.shift());
				if (item.length) {
					all.push(item);
				}
			}
			return all;
		}, []);

	const add = expr => {
		const ar = _.cloneDeep(state[name]);
		ar.push([expr]);
		return inst.clone({ [name]: ar });
	};

	const append = expr => {
		const ar = _.cloneDeep(state[name]);
		ar[ar.length - 1].push(expr);
		return inst.clone({ [name] : ar });
	};

	const addnot = expr => add(esc('NOT (!!)', expr));
	const appendnot = expr => append(esc('NOT (!!)', expr));

	const o = add;
	const or = append;

	inst[name] = o;
	inst[name].or = or;

	o.clear = () => inst.clone({ [name]: [] });

	o.not = addnot;
	or.not = appendnot;

	[...reg].forEach(([key, { gen, notgen }]) => {
		_.set(o, key, (...args) => add(gen(...args)));
		_.set(or, key, (...args) => append(gen(...args)));
		if (notgen) {
			_.set(o, 'not.' + key, (...args) => add(notgen(...args)));
			_.set(or, 'not.' + key, (...args) => append(notgen(...args)));
		} else {
			_.set(o, 'not.' + key, (...args) => addnot(gen(...args)));
			_.set(or, 'not.' + key, (...args) => appendnot(gen(...args)));
		}
	});
};

filters.register = (name, gen, notgen) => {
	if (reg.has(name)) {
		throw new Error('Duplicate filter: ' + name);
	}
	reg.set(name, { gen, notgen });
};

filters.registerBinaryOperator = (name, op, nop) => {
	filters.register(name + '.id',
		(lhs, rhs) => esc(':: !! ::', lhs, op, rhs),
		nop ? ((lhs, rhs) => esc(':: !! ::', lhs, nop, rhs)) : undefined);
	filters.register(name + '.value',
		(lhs, rhs) => esc(':: !! ??', lhs, op, rhs),
		nop ? ((lhs, rhs) => esc(':: !! ??', lhs, nop, rhs)) : undefined);
	filters.register(name + '.expr',
		(lhs, rhs) => esc(':: !! (!!)', lhs, op, rhs),
		nop ? ((lhs, rhs) => esc(':: !! (!!)', lhs, nop, rhs)) : undefined);
};

filters.registerUnaryOperator = (name, op, nop) =>
	filters.register(name,
		lhs => esc(':: !!', lhs, op),
		nop && (lhs => esc(':: !!', lhs, nop)));

filters.registerFunction = (name, func, defaultArgs) =>
	filters.register(name,
		(lhs, args) => func.toCall(
			_.defaults(
				{ [func.getArgNames()[0]]: { type: 'id', value: lhs } },
				args,
				defaultArgs)));

filters.registerUnaryOperator('null', 'IS NULL', 'IS NOT NULL');
filters.registerUnaryOperator('true', '= TRUE', '<> TRUE');
filters.registerUnaryOperator('false', '= FALSE', '<> FALSE');
filters.registerUnaryOperator('in.future', '> NOW()', '<= NOW()');
filters.registerUnaryOperator('in.past', '< NOW()', '>= NOW()');

filters.registerBinaryOperator('equal.to', '=', '<>');
filters.registerBinaryOperator('less.than', '<', '>=');
filters.registerBinaryOperator('greater.than', '>', '<=');

filters.register('equal.to.lower', (field, value) => esc('lower(::) = lower(::)', field, value));

filters.register('crypt', (field, value) => esc(':: = crypt(::, ::)', field, value, field));

filters.register('hmac', (field, value, key) => esc(':: = hmac(::, ::, ??)', field, value, key, crypt.hmac));

filters.register('hash', (field, value, key) => esc(':: = digest(::, ??)', field, value, crypt.hash));

module.exports = filters;
