const modules = {
	escape: require('./escape'),
	escapeId: require('./escapeId'),
	escapeIds: require('./escapeIds'),

	format: require('./format'),
	concat: require('./concat'),

	algo: require('./algo'),
	struct: require('./struct')
};

module.exports = {
	Factory: Factory,
	modules: modules,

	my: new Factory('my'),
	pg: new Factory('pg')
};

function Factory(dialect) {
	return {
		escape: modules.escape[dialect],
		escapeId: modules.escapeId[dialect],
		escapeIds: modules.escapeIds[dialect],

		format: modules.format[dialect],
		concat: modules.concat[dialect],

		algo: modules.algo(dialect),
		struct: require('./struct')
	};
}
