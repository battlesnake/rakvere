const escapeId = require('./escapeId');

function escapeIds(escapeId) {
	return str => str.replace(/\$(\w+)/g, (s, name) => escapeId(name));
}

module.exports = {
	my: escapeIds(escapeId.my),
	pg: escapeIds(escapeId.pg)
};
