const prop = require('../prop');
const esc = require('../escape');
const Func = require('./function');

module.exports = Update;

function Update(proto) {
	Func.call(this, proto);
	const state = this.$;

	this.getBody = ({ terminate } = {}) => {
		const xs = [];
		xs.push('UPDATE', state.get.update());
		xs.push('SET', state.get.set());
		if (state.where.length) {
			xs.push('WHERE', state.get.where());
		}
		if (state.returning.size) {
			xs.push('RETURNING', state.get.returning());
		}
		if (terminate) {
			xs.push(';');
		}
		return [xs.shift(), xs];
	};

	prop.ident(this, 'update');
	prop.values(this, 'set');
	prop.filters(this, 'where');
	prop.fields(this, 'returning');

	return this;
}

Update.prototype = new Func();
Update.prototype.constructor = Update;

if (!module.parent) {
	require('../indent')(
		new Update()
			.name('myfunc')
			.arg('someparam', { type: Number })
			.arg('someotherparam', { type: String })
			.var('ret', { type: 'RECORD' })
			.returns('VOID')
			.update({ id: 'tomato', alias: 'lemon' })
			.set.expr('f1', '2 * 2')
			.set.id('f2', 'someparam')
			.set.null('f3')
			.where.null('lol')
			.where.or.in.future('lol')
			.where.equal.to.value('rofl', 'lmao')
			.where.not.equal.to.id('rofl', 'lemon.id')
			.returning({ id: 'tomato_id', alias: 'id' })
				.toFunction()
	)
	.map(s => s.replace(/\t/g, '   '))
	.forEach(x => console.log(x));
}
