const prop = require('../prop');
const Func = require('./function');

module.exports = Custom;

function Custom(proto) {
	Func.call(this, proto);
	const state = this.$;

	state.body = [];

	this.getBody = () => state.body;
	prop.code(this, 'body');

	return this;
}

Custom.prototype = new Func();
Custom.prototype.constructor = Custom;
