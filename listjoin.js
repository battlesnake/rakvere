module.exports = (xs, sep = '', term = '') => xs.map(
	(x, i) => i === xs.length - 1 ?
		x + term :
		x + sep);
