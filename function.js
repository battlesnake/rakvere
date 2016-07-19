const esc = require('../escape');
const type = require('./type');

module.exports = func;

function func(name, typename, args, vars, body) {
	if (typeof body === 'string') {
		body = [body];
	}
	return [
		esc('CREATE FUNCTION ::(!!)', name, type(typename)),
		esc('RETURNS !! AS $$', type.arglist(args)),
		...(vars ? ['DECLARE', type.arglist(vars)] : []),
		esc('BEGIN'),
		body,
		esc('END;'),
		esc('$$ LANGUAGE plpgsql;')
	];
}
