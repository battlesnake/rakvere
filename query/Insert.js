const prop = require('../prop');

const esc = require('../util/escape');
const indent = require('../util/indent');

const Func = require('./Func');

module.exports = Insert;

function Insert(proto) {
	Func.call(this, proto);
	const state = this.$;

	this.getBody = ({ terminate } = {}) => {
		const xs = [];
		xs.push('INSERT');
		xs.push(esc('INTO !! (!!)', state.get.into(), state.get.set.keys()));
		xs.push(esc('VALUES (!!)', state.get.set.values()));
		if (state.returning.size) {
			xs.push('RETURNING', state.get.returning());
		}
		if (terminate) {
			xs.push(';');
		}
		return [xs.shift(), xs];
	};

	prop.noop(this, 'insert');
	prop.ident(this, 'into');
	prop.values(this, 'set');
	prop.fields(this, 'returning');

	return this;
}

Insert.prototype = new Func();
Insert.prototype.constructor = Insert;

if (!module.parent) {
	indent(
		new Insert()
			.name('myfunc')
			.arg('someparam', { type: Number })
			.arg('someotherparam', { type: String })
			.var('ret', { type: 'RECORD' })
			.returns('VOID')
			.insert()
			.into('tomato')
			.set.expr('f1', '2 * 2')
			.set.id('f2', 'someparam')
			.set.null('f3')
			.returning({ id: 'tomato_id', alias: 'id' })
				.toFunction()
	)
	.map(s => s.replace(/\t/g, '   '))
	.forEach(x => console.log(x));
}
