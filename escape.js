const sqlstring = require('sqlstring');
const pgEscape = require('pg-escape');

module.exports = {
	my: sqlstring.escape,
	pg: pgEscape.literal
};
