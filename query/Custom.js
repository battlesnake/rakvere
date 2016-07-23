const prop = require('../prop');
const Func = require('./Func');

module.exports = Custom;

function Custom(proto) {
	Func.call(this, proto);
	const state = this.$;

	delete state.get.body;

	this.getBody = () => state.get.body();
	prop.code(this, 'body');

	return this;
}

Custom.prototype = new Func();
Custom.prototype.constructor = Custom;
