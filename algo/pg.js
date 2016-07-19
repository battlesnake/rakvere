module.exports = dialect => {

/* Need some way to allow different SELECT queries to run within one procedure,
 * depending on some pre-condition */
const _ = require('lodash');

const escape = require('../escape')[dialect];
const escapeId = require('../escapeId')[dialect];
const escapeIds = require('../escapeIds')[dialect];
const format = require('../format')[dialect];
const concat = require('../concat')[dialect];

const transformTree = require('bs-transform-tree');

/* Functions to bind to WHERE/HAVING helper */

const functions = [];

/* Exports */

const exports = {
	/* If you want to mess with the prototype, here it is */
	Query,
	/* Basic CRUD query types */
	Select, Insert, Update, Delete,
	/* Stored procedure */
	Procedure,
	/* Quick way to create a function */
	functionFactory: genFunction,
	/* For defining custom functions, which will be added to where/having */
	addFunctions: (...func) =>
		functions.push(...func),
	genFunctions: (funcTree, delimiter) =>
		transformTree(funcTree || functions, f => f.name && f.type, f => genFunction(f) + ' ' + delimiter),
	/* Generate stored procedures */
	genProcedures: (procTree, delimiter) =>
		transformTree(procTree, p => p instanceof Query, p => p.toProcedure() + ' ' + delimiter)
};

/* Data types */

function mapType(type) {
	if (type === Number) {
		return 'INT';
	} else if (type === String) {
		return 'VARCHAR(255)';
	} else if (type === Boolean) {
		return 'TINYINT';
	} else if (type === Date) {
		return 'DATETIME';
	} else if (typeof type === 'string') {
		return type;
	} else {
		throw new Error('Invalid type: ' + JSON.stringify(type));
	}
}

/* Function generator */

function genFunction(func) {
	const body = [];
	if (func.expr) {
		body.push(`RETURN ${func.expr}`);
	} else if (func.body) {
		body.push(
			'BEGIN',
			...func.body.map(s => '  ' + s + ';'),
			'END');
	}
	return [
		`CREATE FUNCTION ${escapeId(func.name)}(` + _.map(func.args,
			(type, name) => `${escapeId(name)} ${mapType(type)}`).join(', ') + ')',
		`  RETURNS ${func.type}${func.impure ? '' : ' DETERMINISTIC'}`,
		...body.map(s => '  ' + s)
	].join('\n');
}

/* Clause bindings */

const makeParam = key => {
	if (typeof key !== 'string') {
		throw new Error('Failed to interpret parameter: ' + JSON.stringify(key));
	}
	return escapeId('p_' + key.replace(/\./g, '_'));
};

function addFilters(next, name, state, ar) {
	const isOr = !!ar;
	const push = item => {
		if (!isOr) {
			ar = [];
			state[name].push(ar);
		}
		ar.push(item);
		if (!isOr) {
			next.or = addFilters(next, name, state, ar);
		}
		return next;
	};
	const base = (key, rest) => push({ key, rest });
	base.raw = raw => push({ raw });
	base.func = (key, func) => push({ key, func });
	base.reset = () => {
		state[name].length = 0;
		next.or = null;
		return next;
	};
	base.equal = (key, value) => base(key, format('= ??', [value]));
	base.equal.var = (key, name) => base(key, format('= ::', [name]));
	base.greater = (key, value) => base(key, format('> ??', [value]));
	base.lower = (key, value) => base(key, format('< ??', [value]));
	base.null = key => base(key, 'IS NULL');
	base.future = key => base(key, '> NOW()');
	base.past = key => base(key, '< NOW()');
	base.param = (key, name) => base(key, '= ' + makeParam(name ? name : key));

	base.not = (key, rest) => push({ key, rest, not: true });
	base.not.raw = raw => push({ raw, not: true });
	base.not.func = (key, func) => push({ key, func, not: true });
	base.not.equal = (key, value) => base(key, format('<> ??', [value]));
	base.not.equal.var = (key, name) => base(key, format('<> ::', [name]));
	base.not.greater = (key, value) => base.not(key, format('> ??', [value]));
	base.not.lower = (key, value) => base.not(key, format('< ??', [value]));
	base.not.null = key => base(key, 'IS NOT NULL');
	base.not.future = key => base(key, '<= NOW()');
	base.not.past = key => base(key, '>= NOW()');
	base.not.param = (key, name) => base(key, '<> ' + makeParam(name ? name : key));

	/* Add custom functions */
	functions.map(_.property('name')).forEach(name => {
		if (_.has(base, name)) {
			throw new Error('Conflicting function name: ' + name);
		}
		base[name] = key => base.func(key, name);
		base.not[name] = key => base.not.func(key, name);
	});

	if (!isOr) {
		next[name] = base;
	}

	return base;
}

function addString(next, name, state, mapping) {
	mapping = mapping || _.identity;
	next[name] = value => {
		state[name] = mapping(value);
		return next;
	};
}

function addStringOrCall(next, name, state) {
	next[name] = (proc, ...args) => {
		if (typeof proc === 'string') {
			state[name] = proc;
		} else {
			state[name] = { proc, args: [...args] };
		}
		return next;
	};
}

function addList(next, name, state, mapping) {
	mapping = mapping || _.identity;
	const base = (...args) => {
		state[name].push(mapping(...args));
		return next;
	};
	base.reset = () => state[name].length = 0;
	next[name] = base;
}

function addAssignmentList(next, name, state) {
	const base = (key, value) => {
		state[name].push({ key, value: escape(value) });
		return next;
	};
	base.expr = (key, value) => {
		state[name].push({ key, value: value });
		return next;
	};
	base.param = (key, value) => {
		state[name].push({ key, value: value ? value : makeParam(key) });
		return next;
	};
	base.reset = () => state[name].length = 0;
	next[name] = base;
}

function addArray(next, name, state, mapping) {
	mapping = mapping || _.identity;
	next[name] = (...arr) => {
		const dest = state[name];
		dest.length = 0;
		let items = [...arr];
		if (arr.length === 1 && arr[0] instanceof Array) {
			arr = arr[0];
		}
		arr.map(mapping).forEach(item => dest.push(item));
		return next;
	};
}

function addJoin(next, name, state) {
	addList(next, name, state, (table, field) => ({
		table, field: field ? field : table + '_id'
	}));
}

function addOrder(next, name, state) {
	addString(next, name, state, (key, order) => ({ key, order }));
	next[name].asc = key => next[name](key, 'ASC');
	next[name].desc = key => next[name](key, 'DESC');
}

/* SQL generator */

const genFieldList = list => [...list]
	.map(name => /^(\w+\.)+\*$/.test(name) ?
		name.replace(/([^\.\*]+)/g, s => escapeId(s)) :
		escapeId(name).replace(/["`](\w+) as (\w+)["`]/,
			(a, source, name) => `${escapeId(source)} as ${escapeId(name)}`))
	.join(',\r').split('\r');

const genFilter = conditions => {
	const parseCond = cond => {
		let str = cond.raw ? cond.raw :
			_.has(cond, 'func') ? `${cond.func}(${escapeId(cond.key)})` :
			_.has(cond, 'rest') ? `${escapeId(cond.key)} ${cond.rest}` :
			null;
		if (str === null) {
			throw new Error('Invalid condition');
		}
		str = '(' + str + ')';
		if (cond.not) {
			str = 'NOT ' + str;
		}
		return str;
	};
	return conditions.map(subconds => {
		const bracket = subconds.length > 1;
		return (bracket ? '(' : '') + subconds.map(parseCond).join(' OR ') + (bracket ? ')' : '');
	}).join(' AND\r').split('\r');
};

const gen = {

	select: fields => ['SELECT', ...genFieldList(fields)],

	insert: table => ['INSERT INTO', escapeId(table)],

	update: table => ['UPDATE', escapeId(table)],

	delete: fields => ['DELETE', ...genFieldList(fields)],

	from: table => ['FROM', escapeId(table)],

	where: conds => conds.length ? ['WHERE', ...genFilter(conds)] : [],

	join: joins => joins.map(({ table, field }) => format('JOIN :: USING (::)', [table, field])),

	group: group => group ? ['GROUP BY', group] : [],

	having: conds => conds.length ? ['HAVING', ...genFilter(conds)] : [],

	order: order => order.length ? [
		'ORDER BY',
		...order
			.map(({ key, order }) => (escapeId(key) + (order ? ' ' + order : '')))
			.join(',\r').split('\r')] : [],

	limit: limit => limit.length ? ['LIMIT', limit.join(', ')] : [],

	set: asses => [
		'SET',
		...asses
			.map(({key, value}) => escapeId(key) + ' = ' + value)
			.join(',\r').split('\r')],

	procedureHead: (name, args, vars) => {
		const argList = args
			.map(({name, type}) => `IN ${makeParam(name)} ${type}`)
			.join(', ');
		const varList = [...vars].map(
			([name, { type, value, expr }]) =>
				`  DECLARE ${name} ${mapType(type)} DEFAULT ${expr ? expr : escape(value)};`);
		return [
			`CREATE PROCEDURE ${escapeId(name)}(${argList})`,
			'BEGIN',
			...varList,
		];
	},

	procedureTail: () => [
		'END',
	],

	call: (proc, args) => {
		const procState = proc.getState();
		if (!procState.$name) {
			throw new Error('Cannot add call, query is not mapped to a stored procedure');
		}
		if (args.length !== procState.$args.length) {
			throw new Error('Cannot add call, arguments list is of different length to given arguments');
		}
		args = args.map(arg => {
			if (typeof arg === 'string') {
				return makeParam(arg);
			} else if (arg.expr) {
				return arg.expr;
			} else if (arg.value) {
				return escape(arg.value);
			} else {
				throw new Error('Failed to interpret argument: ' + JSON.stringify(arg));
			}
		});
		return `CALL ${escapeId(procState.$name)}(${args.join(', ')})`;
	},

	calls: list => list.map(({ proc, args }) => gen.call(proc, args)),

};

/* Query generators */

function Query() {
}

Query.prototype = {};

Procedure.prototype = new Query();
Select.prototype = new Query();
Update.prototype = new Query();
Insert.prototype = new Query();
Delete.prototype = new Query();

function stateFactory(args, def) {
	args = [...args];
	if (args.length && args[0].$isQuery) {
		/* Clone */
		return _.cloneDeep(args[0]);
	} else if (args.length) {
		/* Procedure */
		def.$name = args[0];
		if (args[1]) {
			def.$args = mapArgs(args[1]);
		}
		return def;
	} else {
		/* Defaults */
		return def;
	}
}

function mapArgs(args) {
	/* Map procedure arguments */
	return _.map(args, (type, name) => ({ name, type: mapType(type) }));
}

/* Initialise a query instance with common methods and state variables */
function queryFactory(inst, Ctor, state, generate) {
	/* Procedure name */
	state.$name = null;
	/* Procedure arguments */
	state.$args = [];
	/* Local variables */
	state.$vars = new Map();

	/* Capo / Fine */
	state.$validators = { input: [] };

	/* Generic error message to use instead of detailed ones */
	state.$error = null;

	/* Procedure to call on 45000-error instead of resignaling */
	state.$handlers = [];

	inst.clone = () => new Ctor(_.cloneDeep(state));

	inst.getState = () => _.cloneDeep(state);

	inst.procedure = name => {
		state.$name = name;
		return inst;
	};

	inst.args = args => {
		/* Ensure all previous arguments are either included in this list or in the variables */
		args = mapArgs(args);
		const vars = [...state.$vars].map(([name, value]) => ({ name }));
		const missing = _.map(_.differenceBy(state.$args, _.concat(vars, args), 'name'), 'name');
		if (missing.length) {
			throw new Error('New vars+argument list must be superset of previous argument list (missing: ' + missing.join(', ') + ')');
		}
		/* Replace previous list */
		state.$args.length = 0;
		state.$args.push(...args);
		return inst;
	};

	inst.var = (name, type, value) => {
		if (_.every(['name', 'type'], key => _.has(name, key))) {
			[...arguments].forEach(({ name, type, value }) => inst.var(name, type, value));
			return inst;
		}
		state.$vars.set(name, { type, value });
		return inst;
	};

	inst.var.expr = (name, type, expr) => {
		state.$vars.set(name, { type, expr });
		return inst;
	};

	inst.validate = {
		input: (proc, ...args) => {
			state.$validators.input.push({ proc, args: [...args] });
			return inst;
		}
	};

	inst.error = message => {
		state.$error = message;
		return inst;
	};

	inst.handler = (proc, ...args) => {
		state.$handlers.push({ proc, args: [...args] });
		return inst;
	};

	inst.getLines = ({ singleLine, procedure }) => {
		let commands = [];
		let cur = [];
		const funcs = {
			push: s => { cur.push(s); return funcs; },
			next: (s) => {
				if (cur.length) {
					commands.push(cur);
				}
				cur = [];
				if (s) {
					funcs.push(s);
				}
				return funcs;
			}
		};
		generate(funcs);
		if (cur.length) {
			funcs.next();
		}
		commands = commands.map(command =>
			singleLine ?
				[command.join(' ')] :
				command.map(s => (/^\s*[A-Z]/.test(s) ? s : '  ' + s)));

		if (procedure) {
			if (!state.$name) {
				throw new Error('Invalid procedure (name not defined)');
			}
			commands = [
				...gen.procedureHead(state.$name, state.$args, state.$vars),
				...commands.map(command => command.map(line => '  ' + line).join('\n') + ';'),
				...gen.procedureTail()
			];
		}
		return commands;
	};

	inst.toString = (opts) => {
		return inst.getLines(opts || {}).join('\n');
	};

	const call = (proto, ...args) => {
		if (!state.$name) {
			throw new Error('Invalid procedure (name not defined)');
		}
		if (proto) {
			args = state.$args.map(arg => arg.name + ' ' + arg.type).join(', ');
			return `${state.$name}(${args})`;
		} else {
			args = [...args];
			if (args.length !== state.$args.length) {
				throw new Error('Argument count mismatch for function ' + call(true, ...args));
			}
			args.forEach(arg => {
				if (~['number', 'string', 'boolean'].indexOf(typeof arg) || arg instanceof Array || arg instanceof Date || arg === null) {
				} else {
					throw new Error('Invalid parameter type for query: ' + JSON.stringify(arg));
				}
			});
			args = args.map(arg => escape(arg)).join(', ');
			return `CALL ${escapeId(state.$name)}(${args})`;
		}
	};

	inst.toBody = inst.toString;
	inst.toProcedure = () => inst.toString({ procedure: true });
	inst.toCall = (...args) => call(false, ...args);
	inst.toProto = (...args) => call(true, ...args);

	inst.printBody = (...args) => ( console.log(inst.toBody(...args)), inst );
	inst.printProcedure = (...args) => ( console.log(inst.toProcedure(...args)), inst );
	inst.printCall = (...args) => ( console.log(inst.toCall(...args)), inst );
	inst.printProto = (...args) => ( console.log(inst.toProto(...args)), inst );

	inst.toString = inst.toBody;
	inst.print = inst.printBody;
	inst.call = inst.toCall;
}

function constraintLimit(constraint, limit) {
	if (~['none', 'one', 'optional'].indexOf(constraint)) {
		if (limit.length) {
			throw new Error('LIMIT clause specified with a limiting restriction');
		} else {
// For "require" assertions, we can impose a limit to prevent bugs from adding unnecessary database load.
// Temporarily disabled so that the "actual" field of the assertion exception message is useful.
//			return gen.limit([constraint === 'none' ? 1 : 2]);
			return limit;
		}
	} else {
		return limit;
	}
}

function assertRequire(name, require, next) {
	switch (require) {
	case 'none':
		next('IF rows > 0 THEN CALL throw(' + concat(escape("Assertion failed: Result count [query="), escapeId('proc'), escape("] [expect=0] [actual="), escapeId('rows'), escape("]")) + '; END IF');
		break;
	case 'one':
		next('IF rows > 0 THEN CALL throw(' + concat(escape("Assertion failed: Result count [query="), escapeId('proc'), escape("] [expect=1] [actual="), escapeId('rows'), escape("]")) + '; END IF');
		break;
	case 'optional':
		next('IF rows > 0 THEN CALL throw(' + concat(escape("Assertion failed: Result count [query="), escapeId('proc'), escape("] [expect=0/1] [actual="), escapeId('rows'), escape("]")) + '; END IF');
		break;
	case 'some':
		next('IF rows > 0 THEN CALL throw(' + concat(escape("Assertion failed: Result count [query="), escapeId('proc'), escape("] [expect=1+] [actual="), escapeId('rows'), escape("]")) + '; END IF');
		break;
	default:
		throw new Error('Invalid constraint: ' + require);
	}
}

/* Limitation: stored procedures cannot recurse from within temporary table scope */
const get_temp_table_name = state => escapeId('matches_' + state.$name);

function generic_header(state, push, next) {
	if (!state.$name) {
		throw new Error('Procedure is not named');
	}
	const tid = get_temp_table_name(state);
	next(format('DECLARE proc VARCHAR(??) DEFAULT ??', [state.$name.length, state.$name]));
	next('DECLARE rows INT');
	next('DECLARE EXIT HANDLER FOR SQLEXCEPTION');
	push('BEGIN');
	push('  DECLARE code CHAR(5)');
	next('  DECLARE errno INT');
	next('  DECLARE msg TEXT');
	next('  GET DIAGNOSTICS CONDITION 1');
	push('    code = RETURNED_SQLSTATE,');
	push('    errno = MYSQL_ERRNO,');
	push('    msg = MESSAGE_TEXT');
	next(`  DROP TEMPORARY TABLE IF EXISTS ${tid}`);
	next('  ROLLBACK');
	next(escapeIds('  INSERT INTO $error SET $code = code, $errno = errno, $proc = proc, $msg = msg'));
	if (_.isString(state.$error)) {
		next('  IF code = 45000 THEN');
		push('  BEGIN');
		push(format('    SET msg := ' + concat(escape(state.$error), escape(' [query='), escapeId('proc'), escape(']'))));
		if (state.$handlers.length) {
			gen.calls(state.$handlers).forEach(s => next('    ' + s));
		} else {
			next(escapeIds('    RESIGNAL SET MESSAGE_TEXT = $msg'));
		}
		next('  END');
		next('  ELSE');
		push('  BEGIN');
		push('    SET msg := ' + concat(escapeId('msg'), escape('[query='), escapeId('proc'), escape(']')));
		next(escapeIds('    RESIGNAL SET MESSAGE_TEXT = $msg'));
		next('  END');
		next('  END IF');
	} else if (state.$error === null) {
		push('    SET msg := ' + concat(escapeId('msg'), escape('[query='), escapeId('proc'), escape(']')));
		next(escapeIds('    RESIGNAL SET MESSAGE_TEXT = $msg'));
	} else {
		throw new Error(`Invalid error message: ${JSON.stringify(state.$error)}`);
	}
	next('END');
	next('START TRANSACTION');
	gen.calls(state.$validators.input).forEach(next);
	next(`CREATE TEMPORARY TABLE ${tid} AS`);
}

function generic_footer(state, push, next) {
	const tid = get_temp_table_name(state);
	next(`DROP TEMPORARY TABLE ${tid}`);
	next('COMMIT');
}

/* Basic queries */

function Select(...args) {

	const state = stateFactory(args, {
		$isQuery: true,
		$name: null,
		require: 'any',
		$1field: null,
		select: [],
		from: '',
		join: [],
		where: [],
		group: '',
		having: [],
		order: [],
		limit: [],
	});

	const generate = ({ push, next }) => {
		generic_header(state, push, next);
		gen.select(state.select).forEach(push);
		gen.from(state.from).forEach(push);
		gen.join(state.join).forEach(push);
		gen.where(state.where).forEach(push);
		gen.group(state.group).forEach(push);
		gen.having(state.having).forEach(push);
		gen.order(state.order).forEach(push);
		constraintLimit(state.require, state.limit).forEach(push);
		next(`SELECT * FROM ${get_temp_table_name(state)}`);
		next('SET rows := FOUND_ROWS()');
		assertRequire(state.$name, state.require, next);
		generic_footer(state, push, next);
	};

	const push = (...args) => state.str.push(...args);

	queryFactory(this, Select, state, generate);

	addArray(this, 'select', state);
	addString(this, 'from', state);
	addJoin(this, 'join', state);
	addFilters(this, 'where', state);
	addString(this, 'group', state);
	addFilters(this, 'having', state);
	addOrder(this, 'order', state);
	addArray(this, 'limit', state);
	addString(this, 'require', state);

	this.isSingular = () => state.require === 'one' || state.require === 'optional';
	this.setOneField = name => { state.$1field = arguments.length === 0 ? true : name; return this; };
	this.getOneField = () => {
		if (state.$1field === true) {
			if (state.select.length !== 1) {
				throw new Error('Query selects multiple fields but one-field is set');
			}
			return state.select[0];
		} else {
			return state.$1field;
		}
	};
}

function Update(...args) {

	const state = stateFactory(args, {
		$isQuery: true,
		require: 'any',
		update: '',
		join: [],
		set: [],
		where: [],
		order: [],
		limit: [],
	});

	const generate = ({ push, next }) => {
		/*
		 * Select then update in order to validate number of *matched* rows,
		 * which is a number that MySQL won't give us (number of *mutated* rows
		 * is given by ROW_COUNT)
		 */
		const table = state.update;
		const key = table + '_id';
		generic_header(state, push, next);
		push(`SELECT ${escapeId(key)} AS ${escapeId('id')}`);
		gen.from(state.update).forEach(push);
		gen.where(state.where).forEach(push);
		constraintLimit(state.require, state.limit).forEach(push);
		push('FOR UPDATE');
		next('SET rows := FOUND_ROWS()');
		assertRequire(state.$name, state.require, next);
		next();
		gen.update(state.update).forEach(push);
		gen.set(state.set).forEach(push);
		gen.where([[{ key: key, rest: `IN (SELECT ${escapeId('id')} FROM ${get_temp_table_name(state)})` }]]).forEach(push);
		gen.order(state.order).forEach(push);
		generic_footer(state, push, next);
	};

	const push = (...args) => state.str.push(...args);

	queryFactory(this, Update, state, generate);

	addString(this, 'update', state);
	addJoin(this, 'join', state);
	addAssignmentList(this, 'set', state);
	addFilters(this, 'where', state);
	addOrder(this, 'order', state);
	addArray(this, 'limit', state);

	addString(this, 'require', state);
}

function Delete(...args) {

	const state = stateFactory(args, {
		$isQuery: true,
		require: 'any',
		delete: [],
		from: '',
		join: [],
		where: [],
		group: '',
		having: [],
		order: [],
		limit: [],
	});

	const generate = ({ push, next }) => {
		const table = state.update;
		const key = table + '_id';
		generic_header(state, push, next);
		push(`SELECT ${escapeId(key)} AS ${escapeId('id')}`);
		gen.from(state.update).forEach(push);
		gen.where(state.where).forEach(push);
		constraintLimit(state.require, state.limit).forEach(push);
		push('FOR UPDATE');
		next('SET rows := FOUND_ROWS()');
		assertRequire(state.$name, state.require, next);
		next();
		gen.delete(state.delete).forEach(push);
		gen.from(state.from).forEach(push);
		gen.where([[{ key: key, rest: `IN (SELECT ${escapeId('id')} FROM ${get_temp_table_name(state)})` }]]).forEach(push);
		gen.order(state.order).forEach(push);
		generic_footer(state, push, next);
	};

	const push = (...args) => state.str.push(...args);

	queryFactory(this, Delete, state, generate);

	addArray(this, 'delete', state);
	addString(this, 'from', state);
	addFilters(this, 'where', state);
	addOrder(this, 'order', state);
	addArray(this, 'limit', state);

	addString(this, 'require', state);
}

function Insert(...args) {

	const state = stateFactory(args, {
		$isQuery: true,
		insert: '',
		set: []
	});

	const generate = ({ push, next }) => {
		const table = state.update;
		const key = table + '_id';
		generic_header(state, push, next);
		push(`SELECT 1 FROM DUAL`);

		gen.insert(state.insert).forEach(push);
		gen.set(state.set).forEach(push);

		next();
		generic_footer(state, push, next);
	};

	const push = (...args) => state.str.push(...args);

	queryFactory(this, Insert, state, generate);

	addString(this, 'insert', state);
	addAssignmentList(this, 'set', state);
}

/* Stored procedure (wraps other queries) */

function Procedure(...args) {

	const state = stateFactory(args, {
		$isQuery: true,
		$name: null,
		commands: []
	});

	const generate = ({ push, next }) => {
		state.commands.forEach(command => {
			if (command.$isQuery) {
				push('CALL ' + command.toProto());
			} else if (typeof command === 'string') {
				push(command);
			} else {
				throw new Error('Unknown command type');
			}
		});
	};

	const push = (...args) => state.str.push(...args);

	queryFactory(this, Procedure, state, generate);

	this.append = (...items) => ( state.commands.push(...items), this );
	this.prepend = (...items) => ( state.commands.unshift(...items), this );
	this.reset = () => { state.commands.length = 0; return this; };
}

return exports;

};
