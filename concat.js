module.exports = {
	my: (...args) => 'CONCAT(' + [...args].join(', ') + ')',
	pg: (...args) => '(' + [...args].join(' || ') + ')'
};
