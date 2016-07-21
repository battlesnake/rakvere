/* TODO: Use MAP instead of SET so we can store aliases e.g. x AS y */
const _ = require('lodash');
const esc = require('../escape');
const listjoin = require('../listjoin');

const prop = require('./');

module.exports = (inst, name) => {
	const state = inst.$;
	prop.set(inst, name);
	state.get[name] = () => listjoin([...state[name]].map(x => esc.id(x)), ',');
};
