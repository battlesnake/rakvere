const _ = require('lodash');

const esc = require('../util/escape');
const listjoin = require('../util/listjoin');

const prop = {
	set: require('./set'),
	ident: require('./ident')
};

const validator = id => _.has(id, 'expr') ? id.expr : prop.ident.format(id);

const getter = state => () => listjoin([...state], ',');

module.exports = prop.set.factory(validator, getter);
