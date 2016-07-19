function indent(ar) {
	return ar.reduce((res, line) => {
		if (Array.isArray(line)) {
			res.push(...indent(line).map(s => '\t' + s));
		} else if (typeof line === 'string') {
			res.push(line);
		} else {
			throw new Error('Expected: string or array');
		}
		return res;
	}, [])
	.join('\n');
}

module.exports = indent;
