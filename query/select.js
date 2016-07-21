const prop = require('../prop');
const esc = require('../escape');
const Func = require('./function');

module.exports = Select;

function Select(proto) {
	Func.call(this, proto);
	const state = this.$;

	this.getBody = () => {
		const xs = [];
		xs.push('SELECT', state.get.select());
		if (state.from.size) {
			xs.push(esc('FROM !!', state.get.from()));
		}
		xs.push(...state.get.join());
		if (state.where.length) {
			xs.push('WHERE', state.get.where());
		}
		if (state.group.length) {
			xs.push(esc('GROUP BY !!', state.get.group()));
		}
		if (state.having.length) {
			xs.push('HAVING', state.get.having());
		}
		if (state.order.size) {
			xs.push(esc('ORDER BY !!', state.get.order()));
		}
		if (state.limit.length) {
			xs.push(esc('LIMIT ??', state.get.limit()));
		}
		if (state.into.length) {
			xs.push(esc('INTO !!', state.get.into()));
		}
		xs[xs.length - 1] += ';';
		return [xs.shift(), xs];
	};

	prop.fields(this, 'select');
	prop.tables(this, 'from');
	prop.joins(this, 'join');
	prop.filters(this, 'where');
	prop.ident(this, 'group');
	prop.filters(this, 'having');
	prop.fields(this, 'order');
	prop.limit(this, 'limit');
	prop.ident(this, 'into');

	return this;
}

Select.prototype = new Func();
Select.prototype.constructor = Select;

if (!module.parent) {
	require('../indent')(
		new Select()
			.name('myfunc')
			.arg('someparam', { type: Number })
			.arg('someotherparam', { type: String })
			.var('ret', { type: 'RECORD' })
			.returns('VOID')
			.select('potato', 'lemon')
			.from('tomato')
			.join('onion')
			.where.null('cashew')
			.where.or.not.null('cashew')
			.where.null('potato')
			.group('peanut')
			.having.in.future('epoch')
			.order('id')
			.limit([100])
			.into('ret')
				.toFunction()
	)
	.map(s => s.replace(/\t/g, '   '))
	.forEach(x => console.log(x));
}
