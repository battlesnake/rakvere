const _ = require('lodash');

const esc = require('../util/escape');
const type = require('../util/type');

const prop = require('../prop');

module.exports = Func;

function Func(proto) {
	const state = proto || {};

	state.get = {
		body: (...args) => this.getBody(...args)
	};

	Object.defineProperty(this, '$', { get: () => state });

	this.clone = (newState) => new (this.constructor)(_.defaults({}, newState, state));
	prop.simple(this, 'name');
	prop.simple(this, 'returns');
	prop.args(this, 'arg');
	prop.vars(this, 'var');
	prop.code(this, 'pre');
	prop.code(this, 'post');

	this.getBody = () => { throw new Error('Not implemented'); };

	this.getArgNames = () => [...state.args.keys()];

	this.toFunction = () => {
		if (state.name === null) {
			throw new Error('Function has no name');
		}
		if (state.returns === null) {
			throw new Error('Function has no return type');
		}
		const xs = [];
		xs.push(`-- ${state.name}: (${state.get.arg(false)}) => ${state.get.returns()}`);
		xs.push(esc('CREATE OR REPLACE FUNCTION :: (!!)', state.get.name(), state.get.arg(true)));
		xs.push(esc('RETURNS !! AS $$', state.get.returns()));
		if (state.var.size) {
			xs.push('DECLARE', state.get.var());
		}
		xs.push('BEGIN');
		if (state.pre.length) {
			xs.push(['-- pre'], state.get.pre());
		}
		if (state.pre.length || state.post.length) {
			xs.push(['-- body']);
		}
		xs.push(state.get.body({ terminate: true }));
		if (state.post.length) {
			xs.push(['-- post'], state.get.post());
		}
		xs.push('END;');
		xs.push('$$ LANGUAGE plpgsql');
		xs.push(xs.splice(2));
		return xs;
	};

	/* Args: { name: { type, value }... } or [ { type, value }... ] */
	this.toCall = (...args) => {
		if (state.name === null) {
			throw new Error('Function has no name');
		}
		if (args.length === 1 && Array.isArray(args[0])) {
			args = args[0];
		}
		const expectArgs = [...state.args.keys()];
		if (Array.isArray(args)) {
			if (args.length !== expectArgs.length) {
				throw new Error('Incorrect number of arguments for function');
			}
			args = _(args)
				.map((arg, i) => [expectArgs[i], arg])
				.fromPairs()
				.value();
		}
		args = args.map(arg => arg.type ? arg : { type: 'value', value: arg });
		const actualArgs = _.keys(args);
		let diff = _.difference(expectArgs, actualArgs);
		if (diff.length) {
			throw new Error(`Values not specified for arguments to function ${state.name}: ${diff.join(', ')}`);
		}
		diff = _.difference(actualArgs, expectArgs);
		if (diff.length) {
			throw new Error(`Unmatched arguments to function ${state.name}: ${diff.join(', ')}`);
		}
		return esc('::(!!)', args
			.map(({ type, value }) => esc.as(type, value))
			.join(', '));
	};

	if (this.constructor.init) {
		this.constructor.init(this);
	}

	return this;
}
