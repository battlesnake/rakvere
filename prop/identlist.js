const _ = require('lodash');
const esc = require('../escape');
const listjoin = require('../listjoin');

const prop = {
	set: require('./set'),
	ident: require('./ident')
};

const validator = id => prop.ident.format(id);

const getter = state => () => listjoin([...state], ',');

module.exports = prop.set.factory(validator, getter);
