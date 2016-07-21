const prop = require('../prop');

const esc = require('../util/escape');
const indent = require('../util/indent');

const Func = require('./function');

module.exports = Delete;

function Delete(proto) {
	Func.call(this, proto);
	const state = this.$;

	this.getBody = ({ terminate } = {}) => {
		const xs = [];
		xs.push('DELETE');
		xs.push(esc('FROM !!', state.get.from()));
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

	prop.noop(this, 'delete');
	prop.ident(this, 'from');
	prop.filters(this, 'where');
	prop.fields(this, 'returning');

	return this;
}

Delete.prototype = new Func();
Delete.prototype.constructor = Delete;

if (!module.parent) {
	indent(
		new Delete()
			.name('myfunc')
			.arg('someparam', { type: Number })
			.arg('someotherparam', { type: String })
			.var('ret', { type: 'RECORD' })
			.returns('VOID')
			.delete()
			.from('potato')
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
