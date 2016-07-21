const _ = require('lodash');

const esc = require('../escape');
const type = require('../type');
const crypt = require('../crypt');
const listjoin = require('../listjoin');

const prop = {
	map: require('./map')
};

const validator = (name, value) => value;

const reg = new Map();

const getter = data => () => listjoin([...data].map(([name, arg]) => esc(':: = !!', name, arg)), ',');

const values = (inst, name) => {
	const state = inst.$;
	prop.map.factory(validator, getter)(inst, name);
	const setter = inst[name];
	inst[name] = [...reg].reduce((all, [name, { factory }]) => {
		all[name] = factory(setter, state);
		return all;
	}, {});
	state.get[name].keys = () => [...state[name].keys()].map(esc.id).join(', ');
	state.get[name].values = () => [...state[name].values()].join(', ');
};

values.register = (name, factory) => {
	if (reg.has(name)) {
		throw new Error('Duplicate filter: ' + name);
	}
	reg.set(name, { factory });
};

values.register('id', setter => (key, id) => setter(key, esc.id(id)));
values.register('value', setter => (key, value) => setter(key, esc.value(value)));
values.register('expr', setter => (key, expr) => setter(key, expr));
values.register('arg', (setter, state) => (key, id) => {
	if (!state.args.has(key)) {
		throw new Error(`Argument "${key}" is not defined`);
	}
	return setter(key, esc.id(id));
});

values.register('null', setter => key => setter(key, 'NULL'));
values.register('now', setter => key => setter(key, 'NOW()'));

values.register('crypt', setter => (field, value) => setter(field, esc('crypt(::, gen_salt(??))', value, crypt.crypt)));

values.register('hash', setter => (field, value, key) => setter(field, esc('hmac(::, ::, ??)', value, key, crypt.hmac)));

module.exports = values;
