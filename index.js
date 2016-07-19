const _ = require('lodash');

const modules = {
	escape: require('./escape'),
	escapeId: require('./escapeId'),
	escapeIds: require('./escapeIds'),

	format: require('./format'),
	concat: require('./concat'),

	algo: require('./algo'),
	struct: require('./struct'),
};

const generic = {
	Factory: Factory,
	modules: modules,
	select: select,

	my: new Factory('my'),
	pg: new Factory('pg')
};

module.exports = _.assign({}, generic);

function select(dialect) {
	_.keys(module.exports).forEach(key => delete module.exports[key]);
	_.assign({}, new Factory(dialect));
}

function Factory(dialect) {
	return {
		Factory: Factory,
		modules: modules,
		select: () => { throw new Error('Dialect has already been selected'); },

		escape: modules.escape[dialect],
		escapeId: modules.escapeId[dialect],
		escapeIds: modules.escapeIds[dialect],

		format: modules.format[dialect],
		concat: modules.concat[dialect],

		algo: modules.algo[dialect],
		struct: modules.struct,
	};
}
